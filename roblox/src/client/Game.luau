-- The round rules, ported from src/game.ts: states, fixed-step physics, the boss's throws, barrel
-- hits and jump-overs, score, lives and the bonus timer.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Level = require(Shared.Level)
local Levels = require(Shared.Levels)
local Skins = require(Shared.Skins)
local World = require(Shared.World)

local Audio = require(script.Parent.Audio)
local Backdrop = require(script.Parent.Backdrop)
local Barrels = require(script.Parent.Barrels)
local Boss = require(script.Parent.Boss)
local CameraRig = require(script.Parent.CameraRig)
local Combo = require(script.Parent.Combo)
local Fire = require(script.Parent.Fire)
local Ghost = require(script.Parent.Ghost)
local Hud = require(script.Parent.Hud)
local Items = require(script.Parent.Items)
local Obstacles = require(script.Parent.Obstacles)
local Particles = require(script.Parent.Particles)
local Player = require(script.Parent.Player)
local Rig = require(script.Parent.Rig)
local Totem = require(script.Parent.Totem)

local BARREL = Config.BARREL
local C = Config.COLORS
local FIRE = Config.FIRE
local GAME_RULES = Config.GAME_RULES
local GHOST = Config.GHOST
local HAMMER = Config.HAMMER
local ITEM_RADIUS = Config.ITEM_RADIUS
local PLAYER_SIZE = Config.PLAYER_SIZE
local RAINBOW = Config.RAINBOW
local SCORE = Config.SCORE
local STUD = Config.STUD
local SUBSTEP = Config.PHYSICS.substep
local TOTEM = Config.TOTEM

local READY_TIME = 1.6
local DEATH_TIME = 2.2
local CLEAR_TIME = 2.5
local JUMP_BUFFER = 0.12
-- Ignore Space for a moment on the game over screen so a held jump doesn't skip it.
local GAMEOVER_LOCK = 1
local HINT_COOLDOWN = 1.4
-- Smash splinters for fires, ghosts and totems; thrown things use their own look's burst.
local SPLINTERS = { C.cream, C.yellow, C.orange }
local FOOTSTEP_EVERY = 0.16
-- The web picks footstep pitches at random: steps 90-120 Hz, rungs 420-500 Hz over the rendered low note.
local STEP_PITCH_RANGE = 30 / 90
local CLIMB_PITCH_RANGE = 80 / 420

-- Sphere vs upright cylinder standing at (px, py, pz).
local function sphereHitsCylinder(cx: number, cy: number, cz: number, r: number, px: number, py: number, pz: number, radius: number, height: number): boolean
	local horizontalGap = math.max(0, math.sqrt((cx - px) ^ 2 + (cz - pz) ^ 2) - radius)
	local verticalGap = if cy < py then py - cy elseif cy > py + height then cy - (py + height) else 0
	return horizontalGap ^ 2 + verticalGap ^ 2 < r * r
end

local Game = {}
Game.__index = Game

function Game.new(playerGui: Instance)
	local self = setmetatable({}, Game)
	-- Only until _loadLevel below builds the first level for real.
	local first = Level.new(Levels[1])
	self.hud = Hud.new(playerGui, first.def.name)
	self.player = Player.new(first)
	self.rig = Rig.new(workspace)
	self.cameraRig = CameraRig.new()
	self.boss = Boss.new(workspace, first)
	self.barrels = Barrels.new(first, workspace)
	self.particles = Particles.new(workspace)
	self.combo = Combo.new()
	self.audio = Audio.tryNew()
	self.enemies = Instance.new("Folder")
	self.enemies.Name = "Enemies"
	self.enemies.Parent = workspace
	self.fires = {}
	self.ghosts = {}
	self.totems = {}
	self.barrels.onDrum = function(b)
		if self.state ~= "playing" then
			return
		end
		self.particles:burst(b.pos + Vector3.yAxis * 1.4, { C.orange, C.yellow, C.red }, 10, 3)
		self.audio:play("drum")
		if #self.fires < self.level.def.fires then
			table.insert(self.fires, Fire.new(self.level, self.enemies))
			self.audio:play("fire")
		end
	end
	self.barrels.onPit = function(b)
		self.particles:burst(b.pos + Vector3.yAxis * 0.4, RAINBOW, 8, 3)
	end

	self.levelIndex = 0
	self.world = nil :: Model?
	self.goal = nil :: BasePart?
	self.goalSpin = 0
	self:_loadLevel(1)

	self.state = "ready"
	self.stateT = 0
	self.accumulator = 0
	self.jumpBuffer = 0
	self.score = 0
	self.lives = GAME_RULES.lives
	self.round = 1
	self.bonus = GAME_RULES.bonusStart
	self.bonusClock = 0
	self.bossClock = 0
	self.hammerTime = 0
	self.freeze = 0
	self.hintClock = 0
	self.footstepClock = 0
	return self
end

-- Swaps in another level (1-based index into Levels): the pyramid, scenery, pickups and obstacles
-- are rebuilt, and everything that walks the rings is pointed at the new layout. Built on the client
-- because nothing else needs it yet; a shared multiplayer world would move this to the server.
function Game:_loadLevel(index: number)
	if index == self.levelIndex then
		return
	end
	self.levelIndex = index
	if self.world then
		self.world:Destroy()
		self.backdrop:destroy()
		self.items:destroy()
		self.obstacles:destroy()
	end

	local started = os.clock()
	local level = Level.new(Levels[index])
	local skin = Skins[level.def.skin]
	self.level = level
	self.world = World.build(level, workspace)
	self.backdrop = Backdrop.new(level, skin, workspace)
	self.items = Items.new(level, workspace)
	self.obstacles = Obstacles.new(level, workspace)
	self.player.level = level
	self.boss:setLevel(level)
	self.barrels:setLevel(level, self.obstacles, skin.projectile)

	local summitY = level:tierTop(level.summitTier)
	self.throwOrigin = Vector3.new(Config.BOSS_POS.x + 1.3, summitY + 2.4, Config.BOSS_POS.z - 0.6)
	self.goal = self.world:FindFirstChild("Goal") :: BasePart?
	self.goalSpin = 0
	self.hud:setLevel(level.def.name)
	print(`[popscotch] level {index} built: {self.world:GetAttribute("PartCount")} parts in {math.round((os.clock() - started) * 1000)} ms`)
end

-- How many times the player has gone through every level.
function Game:_loop(): number
	return (self.round - 1) // #Levels
end

function Game:pressJump()
	if self.state == "gameover" then
		if self.stateT >= GAMEOVER_LOCK then
			self:newGame()
		end
		return
	end
	self.jumpBuffer = JUMP_BUFFER
end

function Game:newGame()
	self.score = 0
	self.lives = GAME_RULES.lives
	self.round = 1
	self.hud:setScore(self.score)
	self.hud:setLives(self.lives)
	self:_startRound(true)
end

function Game:_setState(state: string)
	self.state = state
	self.stateT = 0
	self.accumulator = 0
	if state == "playing" then
		self.audio:startMusic()
	else
		self.audio:stopMusic()
	end
end

function Game:toggleMute()
	local muted = self.audio:toggleMute()
	local p = self.player
	self:_popup(if muted then "Sound off" else "Sound on", Vector3.new(p.px, p.py + 2.2, p.pz))
end

function Game:_setHammer(on: boolean)
	self.player:setHammer(on)
	self.audio:setHammer(on)
end

function Game:_focus(): Vector3
	local p = self.player
	return Vector3.new(p.px, p.py + 1.5, p.pz)
end

function Game:_clearFires()
	for _, fire in self.fires do
		fire:destroy()
	end
	table.clear(self.fires)
end

function Game:_spawnGhosts()
	for _, ghost in self.ghosts do
		ghost:destroy()
	end
	table.clear(self.ghosts)
	local def = self.level.def
	for i = 1, math.min(def.ghosts, #def.patrols) do
		table.insert(self.ghosts, Ghost.new(self.level, def.patrols[i], GHOST.speed, self.enemies))
	end
end

function Game:_spawnTotems()
	for _, totem in self.totems do
		totem:destroy()
	end
	table.clear(self.totems)
	for _, patrol in self.level.def.totems or {} do
		table.insert(self.totems, Totem.new(self.level, patrol, TOTEM.speed, self.enemies))
	end
end

function Game:_lockHint(ladder: number)
	local kind = self.obstacles:lockKind(ladder)
	if kind then
		self:_hint(if kind == "key" then "Locked · Find the key!" else "Gated · Find the switch!")
	end
end

function Game:_hitsPlayer(at: Vector3, r: number): boolean
	local p = self.player
	return sphereHitsCylinder(at.X, at.Y, at.Z, r, p.px, p.py, p.pz, PLAYER_SIZE.halfWidth, PLAYER_SIZE.height)
end

-- A fresh round lays the pickups out again; retrying after a death keeps what's been collected.
function Game:_startRound(fresh: boolean)
	if fresh then
		self:_loadLevel((self.round - 1) % #Levels + 1)
	end
	local def = self.level.def
	local loop = self:_loop()
	-- Every level and every lap through them makes the barrels (and fires) a little quicker.
	self.barrels.speedMul = math.min(GAME_RULES.maxSpeedMul, 1 + 0.2 * loop + 0.06 * (self.levelIndex - 1))
	self.barrels.ladderChance = math.min(0.5, BARREL.ladderChance + 0.05 * loop)
	self.barrels:clear()
	self:_clearFires()
	self:_spawnGhosts()
	self:_spawnTotems()
	self.obstacles:reset(fresh)
	if fresh then
		self.items:spawn()
		self.hud:setLetters(self.items:lettersHeld())
	end
	self.hammerTime = 0
	self.audio:setHammer(false)
	self.freeze = 0
	self.combo:reset()
	self.particles:clear()
	self.player:reset(def.playerStart)
	self.rig:snap(self.player)
	self.cameraRig:snapTo(def.playerStart.side, self:_focus())
	self.jumpBuffer = 0
	self.bonus = GAME_RULES.bonusStart
	self.bonusClock = 0
	self.bossClock = 1.2
	self.hud:setBonus(self.bonus)
	self:_setState("ready")
	local tip = if def.tip and loop == 0 then ` · {def.tip}` else ""
	self.hud:show(`ROUND {self.round}`, `Level {self.levelIndex} · {Hud.levelTitle(def.name)}{tip}`)
end

function Game:_popup(text: string, at: Vector3)
	self.hud:popup(text, at * STUD)
end

function Game:_addScore(points: number, at: Vector3?)
	self.score += points
	self.hud:setScore(self.score)
	if at then
		self:_popup(`{points}-pt`, at)
	end
end

-- Jump-overs chain into a combo: each one within the window multiplies its points.
function Game:_addJumpScore(base: number, at: Vector3)
	local mult = self.combo:hit()
	local points = base * mult
	self:_addScore(points)
	self:_popup(if mult > 1 then `{points}-pt x{mult}` else `{points}-pt`, at)
	-- Each link lifts the chime a whole tone, so a chain sounds like it's climbing.
	self.audio:play("score", 2 ^ (2 * (mult - 1) / 12))
end

-- A brief world freeze plus screen shake, so hits land.
function Game:_hitStop(seconds: number, shake: number)
	self.freeze = math.max(self.freeze, seconds)
	self.cameraRig:shake(shake)
end

function Game:_hint(text: string)
	if self.hintClock > 0 then
		return
	end
	self.hintClock = HINT_COOLDOWN
	self.audio:play("locked")
	local p = self.player
	self:_popup(text, Vector3.new(p.px, p.py + 2.2, p.pz))
end

function Game:_addLife()
	self.lives = math.min(GAME_RULES.maxLives, self.lives + 1)
	self.hud:setLives(self.lives)
end

function Game:_smash(at: Vector3, points: number, colors: { Color3 }?)
	self.particles:burst(at, colors or SPLINTERS, 14, 5)
	self:_addScore(points, at + Vector3.yAxis * 0.8)
	self:_hitStop(0.06, 0.35)
	self.audio:play("smash")
end

function Game:_onTotemLanded(totem)
	self.particles:burst(totem.base + Vector3.yAxis * 0.1, { C.cream, C.creamDark, C.charcoal }, 8, 3)
	local p = self.player
	local near = (totem.base - Vector3.new(p.px, p.py, p.pz)).Magnitude
	if near < 10 then
		self.audio:play("stomp")
		if self.state == "playing" then
			self.cameraRig:shake(0.25 * (1 - near / 10))
		end
	end
end

function Game:_collectLetter(item)
	local at = item.position
	self.particles:burst(at, { C.yellow, C.orange, C.cream }, 14, 4)
	local held = self.items:lettersHeld()
	self.hud:setLetters(held)
	local count = 0
	for _, h in held do
		if h then
			count += 1
		end
	end
	if count == #held then
		self:_addLife()
		self:_addScore(SCORE.spelled)
		self:_popup("1-U-P! extra life", at + Vector3.yAxis * 0.8)
		self.particles:burst(at, RAINBOW, 30, 6)
		self.audio:play("spelled")
		return
	end
	self:_addScore(SCORE.letter)
	self:_popup(`{Items.letterChar(item)} · {count}/{#held}`, at + Vector3.yAxis * 0.6)
	self.audio:play("letter")
end

function Game:_collect(item)
	self.items:take(item)
	local at = item.position
	if Items.isLetter(item) then
		self:_collectLetter(item)
		return
	end
	local kind = item.type
	local burst = self.particles
	if kind == "orb" then
		self:_addScore(SCORE.orb, at + Vector3.yAxis * 0.4)
		burst:burst(at, { C.cream, C.cyan, C.pink }, 10, 3)
		self.audio:play("orb")
	elseif kind == "gem" then
		self:_addScore(SCORE.gem, at + Vector3.yAxis * 0.6)
		burst:burst(at, RAINBOW, 10, 3)
		self.audio:play("pickup")
	elseif kind == "hotdog" then
		self:_addScore(SCORE.hotdog, at + Vector3.yAxis * 0.6)
		burst:burst(at, { C.red, C.tan, C.yellow }, 12, 4)
		self.audio:play("pickup")
	elseif kind == "oneup" then
		self:_addLife()
		self:_popup("1-Up!", at + Vector3.yAxis * 0.6)
		burst:burst(at, { C.grass, C.cream, C.grassDark }, 16, 4)
		self.audio:play("oneUp")
	elseif kind == "hammer" then
		self.hammerTime = HAMMER.duration
		self:_setHammer(true)
		self:_popup("Hammer!", at + Vector3.yAxis * 0.6)
		burst:burst(at, { C.charcoal, C.yellow }, 12, 4)
		self.audio:play("hammer")
	elseif kind == "key" then
		self.obstacles:unlockKeyDoors()
		self:_popup("Door unlocked!", at + Vector3.yAxis * 0.6)
		burst:burst(at, { C.yellow, C.cream }, 16, 4)
		self.audio:play("unlock")
	end
end

function Game:_die(heading: string, sub: string, fell: boolean?)
	if self.state ~= "playing" then
		return
	end
	self:_setState("dying")
	self.player:die()
	self:_setHammer(false)
	self.hammerTime = 0
	self.audio:play(if fell then "fall" else "hit")
	self.combo:reset()
	self:_hitStop(0.12, 0.6)
	local p = self.player
	self.particles:burst(Vector3.new(p.px, p.py + 0.8, p.pz), { C.orange, C.cyan, C.yellow }, 18, 5)
	self.lives -= 1
	self.hud:setLives(self.lives)
	self.hud:show(heading, if self.lives > 0 then sub else "Last life lost")
end

function Game:_gameOver()
	self.audio:play("gameOver")
	self.barrels:clear()
	self:_clearFires()
	self:_setState("gameover")
	self.hud:show("GAME OVER", `Score {Hud.formatScore(self.score)}  ·  Space to play again`)
end

function Game:_clearRound()
	self:_setState("clear")
	for _, b in self.barrels.list do
		self.particles:burst(b.pos + Vector3.yAxis * b.radius, RAINBOW, 8, 4)
	end
	if self.goal then
		self.particles:burst(self.goal.Position / STUD, RAINBOW, 30, 7)
	end
	self.barrels:clear()
	self:_clearFires()
	self.audio:play("clear")
	local bonus = self.bonus
	self:_addScore(bonus)
	self.hud:show("ROUND CLEAR!", `Bonus {bonus}`)
end

-- Returns true if something killed the player. Holding the hammer, anything touched is smashed instead.
function Game:_checkCollisions(): boolean
	local p = self.player
	local armed = p.hasHammer
	for _, b in self.barrels.list do
		if not b.done and b.state ~= "sink" then
			local br = b.radius
			local pos = b.pos
			local centre = pos + Vector3.yAxis * br
			if self:_hitsPlayer(centre, br * 0.8) then
				if not armed then
					self:_die("Bonk!", "Jump the barrels with Space")
					return true
				end
				self.barrels:smash(b)
				self:_smash(centre, SCORE.smashBarrel, self.barrels:burst())
				continue
			end
			local clearedAbove = p.state == "air"
				and b.state == "roll"
				and b.ring == p.ring
				and math.sqrt((p.px - pos.X) ^ 2 + (p.pz - pos.Z) ^ 2) < 0.7
				and p.py > pos.Y + br * 2 - 0.1
				and p.py - pos.Y < 2.4
			if not b.scored and clearedAbove then
				b.scored = true
				self:_addJumpScore(SCORE.jumpBarrel, pos + Vector3.yAxis * 1.4)
			end
		end
	end

	for i = #self.fires, 1, -1 do
		local fire = self.fires[i]
		if self:_hitsPlayer(fire.position, FIRE.radius) then
			if not armed then
				self:_die("Burnt!", "Flames climb out of the drum")
				return true
			end
			local at = fire.position
			fire:destroy()
			table.remove(self.fires, i)
			self:_smash(at, SCORE.smashFire)
		end
	end

	for i = #self.ghosts, 1, -1 do
		local ghost = self.ghosts[i]
		if self:_hitsPlayer(ghost.position, GHOST.radius) then
			if not armed then
				self:_die("Got you!", "Time your run past the ghost")
				return true
			end
			local at = ghost.position
			ghost:destroy()
			table.remove(self.ghosts, i)
			self:_smash(at, SCORE.smashGhost)
		end
	end

	for i = #self.totems, 1, -1 do
		local totem = self.totems[i]
		if self:_hitsPlayer(totem.position, totem.radius) or self:_hitsPlayer(totem.head, totem.radius) then
			if not armed then
				self:_die("Stomped!", "Run under the totem while it hops")
				return true
			end
			local at = totem.position
			totem:destroy()
			table.remove(self.totems, i)
			self:_smash(at, SCORE.smashTotem)
		else
			local floor = self.level:tierTop(totem.ring)
			local passedUnder = totem:isAirborne()
				and totem.ring == p.ring
				and math.sqrt((p.px - totem.position.X) ^ 2 + (p.pz - totem.position.Z) ^ 2) < 0.5
				and p.py + PLAYER_SIZE.height < floor + totem.clearance
			if not totem.scored and passedUnder then
				totem.scored = true
				self:_addJumpScore(SCORE.underTotem, Vector3.new(p.px, p.py + 2, p.pz))
			end
		end
	end

	for _, item in self.items.list do
		if not item.collected and self:_hitsPlayer(item.position, ITEM_RADIUS) then
			self:_collect(item)
		end
	end
	return false
end

function Game:_stepPlaying(dt: number)
	local p = self.player
	self.combo:update(dt)
	self.accumulator += dt
	while self.accumulator >= SUBSTEP do
		self.accumulator -= SUBSTEP
		local jump = self.jumpBuffer > 0 and p.state == "ground"
		if jump then
			self.jumpBuffer = 0
		end
		local held = self.held
		local result = p:step(SUBSTEP, {
			left = held.left,
			right = held.right,
			up = held.up,
			down = held.down,
			jump = jump,
		}, self.obstacles)
		if result.jumped then
			self.audio:play("jump")
		end
		if result.landed then
			self.audio:play("land")
		end
		if result.fellInPit then
			self:_die("Ouch!", "Jump the spike pits", true)
			return
		end
		if result.reachedSummit then
			self:_clearRound()
			return
		end
		if result.blockedLadder then
			self:_lockHint(result.blockedLadder)
		elseif result.hammerBlocked then
			self:_hint("Can't climb holding the hammer")
		end
		local events = self.obstacles:update(SUBSTEP, { ring = p.ring, s = p.s, grounded = p.state == "ground" })
		if events.crumbled then
			self.audio:play("crumble")
		end
		if events.switched then
			self.audio:play("switch")
			self:_popup("Gate open!", Vector3.new(p.px, p.py + 2.2, p.pz))
		end
		self.barrels:update(SUBSTEP)
		for _, totem in self.totems do
			totem:update(SUBSTEP, self.obstacles)
			if totem.landed then
				self:_onTotemLanded(totem)
			end
		end
		for _, ghost in self.ghosts do
			ghost:update(SUBSTEP)
		end
		for _, fire in self.fires do
			fire:update(SUBSTEP, self.obstacles, self.barrels.speedMul)
		end
		if self:_checkCollisions() then
			return
		end
	end
	if self.cameraRig:watch(p.px, p.pz) then
		self.audio:play("turn")
	end

	if self.hammerTime > 0 then
		self.hammerTime -= dt
		p.hammerBlink = self.hammerTime < HAMMER.warnAt and math.floor(self.hammerTime * 8) % 2 == 0
		if self.hammerTime <= 0 then
			self:_setHammer(false)
		end
	end

	self.bossClock -= dt
	if self.bossClock <= 0 and not self.boss:isBusy() and self.barrels:count() < BARREL.maxAlive then
		self.boss:playThrow()
		self.bossClock = BARREL.minInterval + math.random() * (BARREL.maxInterval - BARREL.minInterval)
	end

	self.bonusClock += dt
	if self.bonusClock >= GAME_RULES.bonusInterval then
		self.bonusClock -= GAME_RULES.bonusInterval
		self.bonus = math.max(0, self.bonus - GAME_RULES.bonusStep)
		self.hud:setBonus(self.bonus)
		if self.bonus == 0 then
			self:_die("Time's up!", "Climb before the bonus runs out")
			return
		end
	end

	if p:isWalking() or p:isClimbing() then
		self.footstepClock += dt
		if self.footstepClock > FOOTSTEP_EVERY then
			self.footstepClock = 0
			if p:isClimbing() then
				self.audio:play("climb", 1 + math.random() * CLIMB_PITCH_RANGE)
			else
				self.audio:play("step", 1 + math.random() * STEP_PITCH_RANGE)
			end
		end
	end
end

function Game:start()
	self:newGame()
end

-- `held` is the live table of held directions, owned by the input code.
function Game:update(dt: number, held)
	self.held = held
	-- Hit-stop: everything holds still while the camera keeps shaking.
	if self.freeze > 0 then
		self.freeze = math.max(0, self.freeze - dt)
		self.cameraRig:settle(dt)
		return
	end
	self.stateT += dt
	self.jumpBuffer = math.max(0, self.jumpBuffer - dt)
	self.hintClock = math.max(0, self.hintClock - dt)

	local state = self.state
	if state == "ready" and self.stateT >= READY_TIME then
		self:_setState("playing")
		self.hud:hide()
	elseif state == "playing" then
		-- The world freezes while the camera turns a corner.
		if not self.cameraRig:isTurning() then
			self:_stepPlaying(dt)
		end
	elseif state == "dying" and self.stateT >= DEATH_TIME then
		if self.lives <= 0 then
			self:_gameOver()
		else
			self:_startRound(false)
		end
	elseif state == "clear" and self.stateT >= CLEAR_TIME then
		self.round += 1
		self:_startRound(true)
	end

	if self.boss:update(dt) and self.state == "playing" then
		self.barrels:spawn(self.throwOrigin)
		self.audio:play("throw")
	end
	self.barrels:render(dt)
	for _, ghost in self.ghosts do
		ghost:render()
	end
	for _, fire in self.fires do
		fire:render()
	end
	for _, totem in self.totems do
		totem:render()
	end
	self.obstacles:render(dt)
	self.particles:update(dt)
	self.items:update(dt)
	self.rig:update(dt, self.player)
	self.cameraRig:update(dt, self:_focus())
	self.backdrop:update(dt, self.cameraRig.azimuth, self.cameraRig.focus)

	if self.goal then
		self.goalSpin += dt * (if self.state == "clear" then 12 else 1.6)
		self.goal.CFrame = CFrame.new(self.goal.Position) * CFrame.Angles(0, self.goalSpin, 0)
	end
end

return Game
