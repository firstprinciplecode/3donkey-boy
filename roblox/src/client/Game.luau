-- The round rules, ported from src/game.ts: states, fixed-step physics, the boss's throws, barrel
-- hits and jump-overs, score, lives and the bonus timer.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Level = require(Shared.Level)
local Levels = require(Shared.Levels)
local Skins = require(Shared.Skins)

local Backdrop = require(script.Parent.Backdrop)
local Barrels = require(script.Parent.Barrels)
local Boss = require(script.Parent.Boss)
local CameraRig = require(script.Parent.CameraRig)
local Fire = require(script.Parent.Fire)
local Ghost = require(script.Parent.Ghost)
local Hud = require(script.Parent.Hud)
local Items = require(script.Parent.Items)
local Player = require(script.Parent.Player)
local Rig = require(script.Parent.Rig)

local BARREL = Config.BARREL
local FIRE = Config.FIRE
local GAME_RULES = Config.GAME_RULES
local GHOST = Config.GHOST
local HAMMER = Config.HAMMER
local ITEM_RADIUS = Config.ITEM_RADIUS
local PLAYER_SIZE = Config.PLAYER_SIZE
local SCORE = Config.SCORE
local STUD = Config.STUD
local SUBSTEP = Config.PHYSICS.substep

local READY_TIME = 1.6
local DEATH_TIME = 2.2
local CLEAR_TIME = 2.5
local JUMP_BUFFER = 0.12
-- Ignore Space for a moment on the game over screen so a held jump doesn't skip it.
local GAMEOVER_LOCK = 1
local HINT_COOLDOWN = 1.4
-- The world pauses this long when the hammer lands a hit, so the smash reads.
local SMASH_FREEZE = 0.06

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
	self.level = Level.new(Levels[1])
	self.hud = Hud.new(playerGui, self.level.def.name)
	self.player = Player.new(self.level)
	self.rig = Rig.new(workspace)
	self.cameraRig = CameraRig.new()
	self.boss = Boss.new(workspace, self.level)
	self.barrels = Barrels.new(self.level, workspace)
	self.backdrop = Backdrop.new(self.level, Skins[self.level.def.skin], workspace)
	self.items = Items.new(self.level, workspace)
	self.enemies = Instance.new("Folder")
	self.enemies.Name = "Enemies"
	self.enemies.Parent = workspace
	self.fires = {}
	self.ghosts = {}
	self.barrels.onDrum = function()
		if self.state == "playing" and #self.fires < self.level.def.fires then
			table.insert(self.fires, Fire.new(self.level, self.enemies))
		end
	end

	local summitY = self.level:tierTop(self.level.summitTier)
	self.throwOrigin = Vector3.new(Config.BOSS_POS.x + 1.3, summitY + 2.4, Config.BOSS_POS.z - 0.6)

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
	self.goal = nil :: BasePart?
	self.goalSpin = 0
	return self
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

function Game:_hitsPlayer(at: Vector3, r: number): boolean
	local p = self.player
	return sphereHitsCylinder(at.X, at.Y, at.Z, r, p.px, p.py, p.pz, PLAYER_SIZE.halfWidth, PLAYER_SIZE.height)
end

-- A fresh round lays the pickups out again; retrying after a death keeps what's been collected.
function Game:_startRound(fresh: boolean)
	local def = self.level.def
	self.barrels:clear()
	self:_clearFires()
	self:_spawnGhosts()
	if fresh then
		self.items:spawn()
		self.hud:setLetters(self.items:lettersHeld())
	end
	self.hammerTime = 0
	self.freeze = 0
	self.player:reset(def.playerStart)
	self.rig:snap(self.player)
	self.cameraRig:snapTo(def.playerStart.side, self:_focus())
	self.jumpBuffer = 0
	self.bonus = GAME_RULES.bonusStart
	self.bonusClock = 0
	self.bossClock = 1.2
	self.hud:setBonus(self.bonus)
	self:_setState("ready")
	self.hud:show(`ROUND {self.round}`, "Jump the barrels · climb to the green coin")
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

function Game:_hint(text: string)
	if self.hintClock > 0 then
		return
	end
	self.hintClock = HINT_COOLDOWN
	local p = self.player
	self:_popup(text, Vector3.new(p.px, p.py + 2.2, p.pz))
end

function Game:_addLife()
	self.lives = math.min(GAME_RULES.maxLives, self.lives + 1)
	self.hud:setLives(self.lives)
end

function Game:_smash(at: Vector3, points: number)
	self:_addScore(points, at + Vector3.yAxis * 0.8)
	self.freeze = math.max(self.freeze, SMASH_FREEZE)
end

function Game:_collectLetter(item)
	local at = item.position
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
		return
	end
	self:_addScore(SCORE.letter)
	self:_popup(`{Items.letterChar(item)} · {count}/{#held}`, at + Vector3.yAxis * 0.6)
end

function Game:_collect(item)
	self.items:take(item)
	local at = item.position
	if Items.isLetter(item) then
		self:_collectLetter(item)
		return
	end
	local kind = item.type
	if kind == "orb" then
		self:_addScore(SCORE.orb, at + Vector3.yAxis * 0.4)
	elseif kind == "gem" then
		self:_addScore(SCORE.gem, at + Vector3.yAxis * 0.6)
	elseif kind == "hotdog" then
		self:_addScore(SCORE.hotdog, at + Vector3.yAxis * 0.6)
	elseif kind == "oneup" then
		self:_addLife()
		self:_popup("1-Up!", at + Vector3.yAxis * 0.6)
	elseif kind == "hammer" then
		self.hammerTime = HAMMER.duration
		self.player:setHammer(true)
		self:_popup("Hammer!", at + Vector3.yAxis * 0.6)
	end
end

function Game:_die(heading: string, sub: string)
	if self.state ~= "playing" then
		return
	end
	self:_setState("dying")
	self.player:die()
	self.player:setHammer(false)
	self.hammerTime = 0
	self.lives -= 1
	self.hud:setLives(self.lives)
	self.hud:show(heading, if self.lives > 0 then sub else "Last life lost")
end

function Game:_gameOver()
	self.barrels:clear()
	self:_clearFires()
	self:_setState("gameover")
	self.hud:show("GAME OVER", `Score {Hud.formatScore(self.score)}  ·  Space to play again`)
end

function Game:_clearRound()
	self:_setState("clear")
	self.barrels:clear()
	self:_clearFires()
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
				self:_smash(centre, SCORE.smashBarrel)
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
				self:_addScore(SCORE.jumpBarrel, pos + Vector3.yAxis * 1.4)
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

	for _, item in self.items.list do
		if not item.collected and self:_hitsPlayer(item.position, ITEM_RADIUS) then
			self:_collect(item)
		end
	end
	return false
end

function Game:_stepPlaying(dt: number)
	local p = self.player
	if self.freeze > 0 then
		self.freeze -= dt
		return
	end
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
		})
		if result.fellInPit then
			self:_die("Ouch!", "Jump the spike pits")
			return
		end
		if result.reachedSummit then
			self:_clearRound()
			return
		end
		if result.hammerBlocked then
			self:_hint("Can't climb holding the hammer")
		end
		self.barrels:update(SUBSTEP)
		for _, ghost in self.ghosts do
			ghost:update(SUBSTEP)
		end
		for _, fire in self.fires do
			fire:update(SUBSTEP, self.barrels.speedMul)
		end
		if self:_checkCollisions() then
			return
		end
	end
	self.cameraRig:watch(p.px, p.pz)

	if self.hammerTime > 0 then
		self.hammerTime -= dt
		p.hammerBlink = self.hammerTime < HAMMER.warnAt and math.floor(self.hammerTime * 8) % 2 == 0
		if self.hammerTime <= 0 then
			p:setHammer(false)
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
		end
	end
end

function Game:start()
	self:newGame()
end

-- `held` is the live table of held directions, owned by the input code.
function Game:update(dt: number, held)
	self.held = held
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
	end
	self.barrels:render(dt)
	for _, ghost in self.ghosts do
		ghost:render()
	end
	for _, fire in self.fires do
		fire:render()
	end
	self.items:update(dt)
	self.rig:update(dt, self.player)
	self.cameraRig:update(dt, self:_focus())
	self.backdrop:update(dt, self.cameraRig.azimuth, self.cameraRig.focus)

	if not self.goal then
		local world = workspace:FindFirstChild("Popscotch")
		self.goal = world and world:FindFirstChild("Goal") :: BasePart?
	end
	if self.goal then
		self.goalSpin += dt * (if self.state == "clear" then 12 else 1.6)
		self.goal.CFrame = CFrame.new(self.goal.Position) * CFrame.Angles(0, self.goalSpin, 0)
	end
end

return Game
