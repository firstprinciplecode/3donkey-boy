-- The round rules, ported from src/game.ts: states, fixed-step physics, the boss's throws, barrel
-- hits and jump-overs, score, lives and the bonus timer.

local Lighting = game:GetService("Lighting")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local HiScore = require(Shared.HiScore)
local Level = require(Shared.Level)
local Levels = require(Shared.Levels)
local Skins = require(Shared.Skins)
local TimeOfDay = require(Shared.TimeOfDay)
local VoxelBuilder = require(Shared.VoxelBuilder)
local World = require(Shared.World)

local Audio = require(script.Parent.Audio)
local Backdrop = require(script.Parent.Backdrop)
local Barrels = require(script.Parent.Barrels)
local Boss = require(script.Parent.Boss)
local CameraRig = require(script.Parent.CameraRig)
local Combo = require(script.Parent.Combo)
local Crawler = require(script.Parent.Crawler)
local Hazards = require(script.Parent.Hazards)
local Fire = require(script.Parent.Fire)
local Fx = require(script.Parent.Fx)
local Ghost = require(script.Parent.Ghost)
local Hud = require(script.Parent.Hud)
local Items = require(script.Parent.Items)
local Obstacles = require(script.Parent.Obstacles)
local Particles = require(script.Parent.Particles)
local Player = require(script.Parent.Player)
local Rig = require(script.Parent.Rig)
local Scores = require(script.Parent.Scores)
local Totem = require(script.Parent.Totem)
local Weather = require(script.Parent.Weather)

local BARREL = Config.BARREL
local C = Config.COLORS
local CRAWLER = Config.CRAWLER
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
-- Fire jets erupting within this distance of the player are heard.
local JET_HEARING = 9
local SCORCH_HEARING = 10
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
	self.fx = Fx.new(self.hud.gui)
	self.weather = Weather.new(self.hud.gui)
	self.scores = Scores.new()
	self.hiScore = 0
	-- Started from a later level (the Studio skip key), so the score stays off the table.
	self.practice = false
	self.initials = { "A", "A", "A" }
	self.initialCursor = 1
	self.returning = false
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
	self.crawlers = {}
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
	self.barrels.onSplit = function(b)
		if self.state ~= "playing" then
			return
		end
		self.particles:burst(Barrels.centre(b), self.barrels:burst(), 10, 3)
		self.audio:play("crumble")
	end
	self.barrels.onScorch = function(at)
		if self.state ~= "playing" then
			return
		end
		self.particles:burst(at + Vector3.yAxis * 0.3, { C.lava, C.orange, C.yellow }, 8, 3)
		local p = self.player
		if (at - Vector3.new(p.px, p.py, p.pz)).Magnitude < SCORCH_HEARING then
			self.audio:play("fire")
		end
	end

	self.levelIndex = 0
	self.world = nil :: Model?
	self.goal = nil :: BasePart?
	self.goalSpin = 0
	self:_loadLevel(1)

	self.state = "title"
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
		self.hazards:destroy()
	end

	local started = os.clock()
	local level = Level.new(Levels[index])
	local skin = Skins[level.def.skin]
	self.level = level
	self.world, self.worldGlow = World.build(level, workspace)
	self.backdrop = Backdrop.new(level, skin, workspace)
	self.weather:setSkin(level.def.skin)
	-- New scenery is built unlit, so the next time of day has to be applied in full.
	self.time = nil
	self.items = Items.new(level, workspace)
	self.obstacles = Obstacles.new(level, workspace)
	self.hazards = Hazards.new(level, skin.drop, workspace)
	self.player.level = level
	self.boss:setLevel(level)
	self.barrels:setLevel(level, self.obstacles, skin.projectile)

	local summitY = level:tierTop(level.summitTier)
	self.throwOrigin = Vector3.new(Config.BOSS_POS.x + 1.3, summitY + 2.4, Config.BOSS_POS.z - 0.6)
	self.goal = self.world:FindFirstChild("Goal") :: BasePart?
	self.goalSpin = 0
	self.hud:setLevel(index, level.def.name)
	self.audio:setTheme(level.def.skin)
	print(`[popscotch] level {index} built: {self.world:GetAttribute("PartCount")} parts in {math.round((os.clock() - started) * 1000)} ms`)
end

-- How many times the player has gone through every level.
function Game:_loop(): number
	return (self.round - 1) // #Levels
end

-- One pressed action from any input: "jump", "confirm", "back", "pause", "mute", a direction, or
-- "letter" with the letter typed. What it does depends on the screen.
function Game:press(action: string, letter: string?)
	if action == "mute" then
		self:toggleMute()
		return
	end
	local state = self.state
	if state == "initials" then
		self:_editInitials(action, letter)
	elseif state == "title" then
		if action == "jump" or action == "confirm" then
			self:newGame()
		end
	elseif state == "gameover" then
		if (action == "jump" or action == "confirm") and self.stateT >= GAMEOVER_LOCK then
			self:newGame()
		end
	elseif state == "paused" then
		if action == "jump" or action == "confirm" or action == "pause" then
			self:_resume()
		end
	elseif action == "pause" then
		if state == "playing" then
			self:_pause()
		end
	elseif action == "jump" then
		self.jumpBuffer = JUMP_BUFFER
	end
end

function Game:pressJump()
	self:press("jump")
end

function Game:setInputMode(mode: string)
	self.hud:setInputMode(mode)
end

function Game:newGame()
	self.score = 0
	self.lives = GAME_RULES.lives
	self.round = 1
	self.practice = false
	self.hud:setScore(self.score)
	self.hud:setLives(self.lives)
	self.hud:hideOverlay()
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

function Game:togglePause()
	self:press("pause")
end

-- Called when the window loses focus or the Roblox menu opens, so the player doesn't die while away.
function Game:autoPause()
	if self.state == "playing" then
		self:_pause()
	end
end

function Game:_pause()
	self.state = "paused"
	self.audio:pauseMusic()
	self.hud:showMessage("Paused", "resume")
end

function Game:_resume()
	self.hud:hideOverlay()
	self:_setState("playing")
end

-- Studio testing aid (bound in init.client): straight to the next round's level, keeping score and lives.
function Game:skipLevel()
	if self.state == "gameover" or self.state == "initials" then
		return
	end
	self.practice = true
	self.hud:hideOverlay()
	self.round += 1
	self:_startRound(true)
end

function Game:isMuted(): boolean
	return self.audio.muted == true
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

-- Each lap through the levels adds a ghost, up to one per patrol route.
function Game:_spawnGhosts(loop: number)
	for _, ghost in self.ghosts do
		ghost:destroy()
	end
	table.clear(self.ghosts)
	local def = self.level.def
	local speed = GHOST.speed * self.barrels.speedMul
	for i = 1, math.min(def.ghosts + loop, #def.patrols) do
		table.insert(self.ghosts, Ghost.new(self.level, def.patrols[i], speed, self.enemies))
	end
end

function Game:_spawnTotems()
	for _, totem in self.totems do
		totem:destroy()
	end
	table.clear(self.totems)
	local speed = TOTEM.speed * self.barrels.speedMul
	local look = Skins[self.level.def.skin].totem
	for _, patrol in self.level.def.totems or {} do
		table.insert(self.totems, Totem.new(self.level, patrol, speed, self.enemies, look))
	end
end

function Game:_spawnCrawlers()
	for _, crawler in self.crawlers do
		crawler:destroy()
	end
	table.clear(self.crawlers)
	local look = Skins[self.level.def.skin].crawler
	local speed = CRAWLER.speed * self.barrels.speedMul
	for _, patrol in self.level.def.crawlers or {} do
		table.insert(self.crawlers, Crawler.new(self.level, patrol, look, speed, self.enemies))
	end
end

function Game:_lockHint(ladder: number)
	local kind = self.obstacles:lockKind(ladder)
	if kind == "relics" then
		local left = self.items:relicsLeft()
		local name = Skins[self.level.def.skin].relic.name
		self:_hint(`Sealed · {left} {name}{if left == 1 then "" else "s"} to go!`)
	elseif kind then
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
		self:_setTime(TimeOfDay.forLevel(self.round, #Levels, Levels[(self.round - 1) % #Levels + 1].skin))
	end
	local def = self.level.def
	local loop = self:_loop()
	-- Every level and every lap through them makes the barrels (and fires) a little quicker.
	self.barrels.speedMul = math.min(GAME_RULES.maxSpeedMul, 1 + 0.2 * loop + 0.06 * (self.levelIndex - 1))
	self.barrels.ladderChance = math.min(0.5, BARREL.ladderChance + 0.05 * loop)
	self.barrels:clear()
	self:_clearFires()
	self:_spawnGhosts(loop)
	self:_spawnTotems()
	self:_spawnCrawlers()
	self.obstacles:reset(fresh)
	self.hazards:reset()
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
	self.hud:setRound(self.round)
	self.cameraRig:setShowcase(false)
	self.hud:hideOverlay()
	self:_setState("ready")
	local when = if self.time == "dusk" then " · Dusk" elseif self.time == "night" then " · Night" else ""
	local tip = if def.tip and loop == 0 then ` · {def.tip}` else ""
	self.hud:show(`Round {self.round}`, `Level {self.levelIndex} · {Hud.levelTitle(def.name)}{when}{tip}`)
end

-- Day, dusk or night: the sky gradient and stars, the light, and whether windows and lanterns glow.
-- Lighting is set on the client, like the rest of the level, so each player sees their own round.
function Game:_setTime(time: string)
	if time == self.time then
		return
	end
	self.time = time
	local light = TimeOfDay.lighting(time, self.level.def.skin)
	Lighting.ClockTime = light.ClockTime
	Lighting.Brightness = light.Brightness
	Lighting.Ambient = light.Ambient
	Lighting.OutdoorAmbient = light.OutdoorAmbient
	Lighting.ColorShift_Top = light.ColorShift_Top
	VoxelBuilder.setGlow(self.worldGlow, light.glow)
	VoxelBuilder.setGlow(self.backdrop.glowParts, light.glow)
	local skinName = self.level.def.skin
	self.backdrop:setSky(TimeOfDay.sky(skinName, Skins[skinName], time), light.stars)
	self.hud:setTime(time)
	self.fx:setTime(time)
end

function Game:_popup(text: string, at: Vector3)
	self.hud:popup(text, at * STUD)
end

function Game:_addScore(points: number, at: Vector3?)
	self.score += points
	self.hud:setScore(self.score)
	if self.score > self.hiScore then
		self.hiScore = self.score
		self.hud:setHi(self.hiScore)
	end
	if at then
		self:_popup(`{points} pt`, at)
	end
end

-- Jump-overs chain into a combo: each one within the window multiplies its points.
function Game:_addJumpScore(base: number, at: Vector3)
	local mult = self.combo:hit()
	local points = base * mult
	self:_addScore(points)
	self:_popup(if mult > 1 then `{points} pt x{mult}` else `{points} pt`, at)
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

function Game:_onHazards(events)
	if events.cracked then
		self.audio:play("crack")
	end
	for _, s in events.shattered do
		self.particles:burst(s.at, s.colors, 10, 3)
		self.audio:play("shatter")
	end
	local p = self.player
	local here = Vector3.new(p.px, p.py, p.pz)
	for _, at in events.erupted do
		if (at - here).Magnitude < JET_HEARING then
			self.audio:play("jet")
			break
		end
	end
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
	elseif kind == "relic" then
		self:_addScore(SCORE.relic)
		burst:burst(at, { C.gold, C.yellow, C.cream }, 16, 4)
		local left, total = self.items:relicsLeft()
		if left == 0 and self.obstacles:unlockRelicDoors() then
			self:_popup("Summit unsealed!", at + Vector3.yAxis * 0.6)
			self.audio:play("unlock")
		else
			local name = Skins[self.level.def.skin].relic.name
			self:_popup(`{Hud.levelTitle(name)} {total - left}/{total}`, at + Vector3.yAxis * 0.6)
			self.audio:play("relic")
		end
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

-- Pulls back to the whole pyramid; a score that makes the table asks for initials first (as on the web).
function Game:_gameOver()
	self.audio:play("gameOver")
	self.barrels:clear()
	self:_clearFires()
	self.hud:hide()
	self:_framePyramid()
	local board = self.scores.board
	if self.practice or not HiScore.insertionIndex(board, self.score) then
		self:_showGameOver(nil)
		return
	end
	local known = self.scores.name
	if known and HiScore.bestFor(board, known) >= self.score then
		self:_showGameOver(HiScore.indexOf(board, known))
		return
	end
	local start = known or "AAA"
	self.initials = { string.sub(start, 1, 1), string.sub(start, 2, 2), string.sub(start, 3, 3) }
	self.initialCursor = 1
	self.returning = known ~= nil
	self:_setState("initials")
	self.hud:showInitials(self.initials, self.initialCursor, self.score, self.returning)
end

-- Three-letter name entry: up and down cycle a slot, left and right move, typing fills it.
function Game:_editInitials(action: string, letter: string?)
	local changed = true
	if action == "letter" and letter then
		self.initials[self.initialCursor] = letter
		self.initialCursor = math.min(3, self.initialCursor + 1)
	elseif action == "left" then
		self.initialCursor = (self.initialCursor + 1) % 3 + 1
	elseif action == "right" then
		self.initialCursor = self.initialCursor % 3 + 1
	elseif action == "up" or action == "down" then
		local slot = self.initialCursor
		self.initials[slot] = HiScore.cycleLetter(self.initials[slot], if action == "up" then 1 else -1)
	elseif action == "back" then
		self.initialCursor = math.max(1, self.initialCursor - 1)
	elseif action == "jump" or action == "confirm" then
		self:_saveInitials()
		return
	else
		changed = false
	end
	if changed then
		self.audio:play("land")
		self.hud:showInitials(self.initials, self.initialCursor, self.score, self.returning)
	end
end

function Game:_saveInitials()
	local name = table.concat(self.initials)
	local score = self.score
	local placed = self.scores:submit(name, score, function(index)
		-- The server's table may differ (other players); repaint it if the screen is still up.
		if self.state == "gameover" then
			self.hud:setBoard(self.scores.board, index)
		end
	end)
	if placed and placed.improved then
		self.audio:play("score")
	end
	self.hiScore = math.max(self.hiScore, HiScore.top(self.scores.board))
	self.hud:setHi(self.hiScore)
	self:_showGameOver(if placed then placed.index else nil)
end

function Game:_showGameOver(highlight: number?)
	self:_setState("gameover")
	self.hud:showGameOver(self.score, self.scores.board, highlight)
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
	self.hud:show("Round clear!", `Bonus {bonus}`)
end

-- Returns true if something killed the player. Holding the hammer, anything touched is smashed instead.
function Game:_checkCollisions(): boolean
	local p = self.player
	local armed = p.hasHammer
	for _, b in self.barrels.list do
		if not b.done and b.state ~= "sink" then
			local br = b.radius
			local pos = b.pos
			local centre = Barrels.centre(b)
			if self:_hitsPlayer(centre, br * 0.8) then
				if not armed then
					self:_die("Bonk!", "Jump over the barrels")
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
				and p.py > centre.Y + br - 0.1
				and p.py - pos.Y < 2.4
			if not b.scored and clearedAbove then
				b.scored = true
				-- Bigger projectiles are riskier to clear, so they pay more (in steps of 50).
				local points = math.round(SCORE.jumpBarrel * (br / BARREL.radius) / 50) * 50
				self:_addJumpScore(points, pos + Vector3.yAxis * 1.4)
			end
		end
	end

	for _, danger in self.barrels.dangers do
		if self:_hitsPlayer(danger.at, danger.r) then
			self:_die("Scorched!", "Lava rocks leave burning patches")
			return true
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

	for i = #self.crawlers, 1, -1 do
		local crawler = self.crawlers[i]
		local cp = crawler.position
		if self:_hitsPlayer(cp, crawler.radius) then
			if not armed then
				self:_die("Ouch!", "Jump the critters on the path")
				return true
			end
			crawler:destroy()
			table.remove(self.crawlers, i)
			self:_smash(cp, SCORE.smashCrawler)
			continue
		end
		if p.state == "ground" then
			crawler.scored = false
		end
		local clearedAbove = p.state == "air"
			and crawler.ring == p.ring
			and math.sqrt((p.px - cp.X) ^ 2 + (p.pz - cp.Z) ^ 2) < 0.8
			and p.py > crawler.base.Y + crawler.height - 0.1
		if not crawler.scored and clearedAbove then
			crawler.scored = true
			self:_addJumpScore(SCORE.jumpCrawler, cp + Vector3.yAxis * 1.2)
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

	for _, danger in self.hazards.dangers do
		if self:_hitsPlayer(danger.at, danger.r) then
			if danger.kind == "jet" then
				self:_die("Toasted!", "Fire traps erupt on a beat")
			else
				self:_die("Bonk!", "Look up: things fall when you walk under them")
			end
			return true
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
		local jump = self.jumpBuffer > 0 and (p.state == "ground" or p.state == "swing")
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
		if result.grabbed then
			-- A press buffered in mid-air shouldn't let go the moment you catch the rope.
			self.jumpBuffer = 0
			self.audio:play("climb")
		end
		if result.bounced then
			self.audio:play("spring")
			self.obstacles:boing(p.ring, p.s)
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
		self:_onHazards(self.hazards:update(SUBSTEP, p))
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
		for _, crawler in self.crawlers do
			crawler:update(SUBSTEP, self.obstacles)
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

-- Whole pyramid in frame, the same pull-back the web title uses.
function Game:_framePyramid()
	local summitY = self.level:tierTop(self.level.summitTier)
	local zoom = math.min(0.5, 8 / self.level:tierHalf(0))
	self.cameraRig:setShowcase(true, Vector3.new(0, summitY / 2, 0), zoom)
end

function Game:start()
	self.score = 0
	self.lives = GAME_RULES.lives
	self.round = 1
	self.bonus = GAME_RULES.bonusStart
	self.hud:setScore(self.score)
	self.hud:setLives(self.lives)
	self.hud:setBonus(self.bonus)
	self:_setTime("day")
	self.items:spawn()
	self.hud:setLetters(self.items:lettersHeld())
	self:_spawnGhosts(0)
	self:_spawnCrawlers()
	self:_spawnTotems()
	self.player:reset(self.level.def.playerStart)
	self.rig:snap(self.player)
	self:_framePyramid()
	self:_setState("title")
	self.hud:showTitle(self.scores.board)
	self.scores:fetch(function()
		self.hiScore = math.max(self.hiScore, HiScore.top(self.scores.board))
		self.hud:setHi(self.hiScore)
		self.hud:setBoard(self.scores.board)
	end)
end

-- `held` is the live table of held directions, owned by the input code.
function Game:update(dt: number, held)
	self.held = held
	self.weather:update(dt)
	self.hud:update(dt)
	self:_frame(dt)
	-- After the camera has moved, so the edge ghosts stay pinned to the screen.
	self.fx:update(dt)
end

function Game:_frame(dt: number)
	if self.state == "paused" then
		return
	end
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
	if state == "title" then
		for _, ghost in self.ghosts do
			ghost:update(dt)
		end
		for _, crawler in self.crawlers do
			crawler:update(dt, self.obstacles)
		end
		for _, totem in self.totems do
			totem:update(dt, self.obstacles)
		end
	elseif state == "ready" and self.stateT >= READY_TIME then
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
	for _, crawler in self.crawlers do
		crawler:render()
	end
	self.obstacles:render(dt)
	self.hazards:render()
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
