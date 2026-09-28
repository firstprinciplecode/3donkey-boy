-- The round rules, ported from src/game.ts: states, fixed-step physics, the boss's throws, barrel
-- hits and jump-overs, score, lives and the bonus timer.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Level = require(Shared.Level)
local Levels = require(Shared.Levels)

local Barrels = require(script.Parent.Barrels)
local Boss = require(script.Parent.Boss)
local CameraRig = require(script.Parent.CameraRig)
local Fire = require(script.Parent.Fire)
local Ghost = require(script.Parent.Ghost)
local Hud = require(script.Parent.Hud)
local Player = require(script.Parent.Player)
local Rig = require(script.Parent.Rig)

local BARREL = Config.BARREL
local FIRE = Config.FIRE
local GAME_RULES = Config.GAME_RULES
local GHOST = Config.GHOST
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
	self:_startRound()
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

function Game:_startRound()
	local def = self.level.def
	self.barrels:clear()
	self:_clearFires()
	self:_spawnGhosts()
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

function Game:_addScore(points: number, at: Vector3?)
	self.score += points
	self.hud:setScore(self.score)
	if at then
		self.hud:popup(`{points}-pt`, at * STUD)
	end
end

function Game:_die(heading: string, sub: string)
	if self.state ~= "playing" then
		return
	end
	self:_setState("dying")
	self.player:die()
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

-- Returns true if something killed the player.
function Game:_checkCollisions(): boolean
	local p = self.player
	for _, b in self.barrels.list do
		if not b.done and b.state ~= "sink" then
			local br = b.radius
			local pos = b.pos
			if self:_hitsPlayer(pos + Vector3.yAxis * br, br * 0.8) then
				self:_die("Bonk!", "Jump the barrels with Space")
				return true
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

	for _, fire in self.fires do
		if self:_hitsPlayer(fire.position, FIRE.radius) then
			self:_die("Burnt!", "Flames climb out of the drum")
			return true
		end
	end

	for _, ghost in self.ghosts do
		if self:_hitsPlayer(ghost.position, GHOST.radius) then
			self:_die("Got you!", "Time your run past the ghost")
			return true
		end
	end
	return false
end

function Game:_stepPlaying(dt: number)
	local p = self.player
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
			self:_startRound()
		end
	elseif state == "clear" and self.stateT >= CLEAR_TIME then
		self.round += 1
		self:_startRound()
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
	self.rig:update(dt, self.player)
	self.cameraRig:update(dt, self:_focus())

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
