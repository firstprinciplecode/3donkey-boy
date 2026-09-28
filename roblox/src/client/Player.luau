-- The climber's movement on the rings and ladders, ported from src/entities/player.ts.
-- Positions are in game units; Rig turns them into studs.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Level = require(Shared.Level)

local PHYSICS = Config.PHYSICS

local Player = {}
Player.__index = Player

function Player.new(level)
	local self = setmetatable({}, Player)
	self.level = level
	self.ring = 0
	self.s = 0
	self.y = 0
	self.vs = 0
	self.vy = 0
	self.state = "ground"
	self.path = nil
	self.d = 0
	self.side = 0
	self.facing = 1
	self.moving = false
	self.inPit = false
	self.hasHammer = false
	-- Flickers the hammer when it's about to run out; the rig reads it.
	self.hammerBlink = false
	self.px, self.py, self.pz = 0, 0, 0
	return self
end

function Player:setHammer(on: boolean)
	self.hasHammer = on
	self.hammerBlink = false
end

function Player:reset(spot)
	self.ring = spot.ring
	self.s = self.level:spotS(spot)
	self.y = self.level:tierTop(spot.ring)
	self.vs = 0
	self.vy = 0
	self.state = "ground"
	self.path = nil
	self.facing = 1
	self.moving = false
	self.inPit = false
	self:setHammer(false)
	self:_updatePosition()
end

function Player:die()
	self.state = "dead"
end

function Player:onVerticalPart(): boolean
	return self.path ~= nil and self.path.isVertical(self.d)
end

function Player:isWalking(): boolean
	return self.moving and (self.state == "ground" or (self.state == "ladder" and not self:onVerticalPart()))
end

function Player:isClimbing(): boolean
	return self.moving and self.state == "ladder" and self:onVerticalPart()
end

function Player:step(dt: number, controls)
	local result = { jumped = false, landed = false, reachedSummit = false, fellInPit = false, hammerBlocked = false }
	if self.state == "ground" then
		self:_stepGround(dt, controls, result)
	elseif self.state == "air" then
		self:_stepAir(dt, result)
	elseif self.state == "ladder" then
		self:_stepLadder(dt, controls, result)
	end
	self:_updatePosition()
	return result
end

-- The hammer takes both hands, so ladders are off while holding it.
function Player:_tryLadder(path, d: number, result): boolean
	if self.hasHammer then
		result.hammerBlocked = true
		return false
	end
	self:_enterLadder(path, d)
	return true
end

function Player:_stepGround(dt: number, c, result)
	local L = self.level
	local grab = PHYSICS.ladderGrab
	if c.up then
		for _, path in L.ladderPaths do
			if path.ladder.ring == self.ring and L:ringDistance(self.ring, self.s, path.bottomS) < grab then
				if self:_tryLadder(path, 0.01, result) then
					return
				end
				break
			end
		end
	end
	if c.down then
		for _, path in L.ladderPaths do
			local fromAbove = path.topS ~= nil and path.ladder.ring + 1 == self.ring
			if fromAbove and L:ringDistance(self.ring, self.s, path.topS) < grab then
				if self:_tryLadder(path, path.length - 0.01, result) then
					return
				end
				break
			end
		end
	end

	local dir = (if c.right then 1 else 0) - (if c.left then 1 else 0)
	if dir ~= 0 then
		self.facing = dir
	end
	self.vs = dir * PHYSICS.moveSpeed
	self.moving = dir ~= 0

	if c.jump then
		-- Air control is locked at take-off, as in the arcade original.
		self.state = "air"
		self.vy = PHYSICS.jumpVelocity
		result.jumped = true
		return
	end
	self.s = (self.s + self.vs * dt) % L:ringLength(self.ring)
	if L:overGap(self.ring, self.s) then
		self.state = "air"
		self.vy = 0
	end
end

function Player:_stepAir(dt: number, result)
	local L = self.level
	local top = L:tierTop(self.ring)
	self.vy += PHYSICS.gravity * dt
	if not self.inPit then
		self.s = (self.s + self.vs * dt) % L:ringLength(self.ring)
	end
	self.y += self.vy * dt

	local overGap = L:overGap(self.ring, self.s)
	if overGap and self.y < top - 0.05 then
		self.inPit = true
	end
	if self.inPit then
		local floor = top - Level.PIT_DEPTH * 0.7
		if self.y <= floor then
			self.y = floor
			result.fellInPit = true
		end
		return
	end
	if not overGap and self.y <= top then
		self.y = top
		self.vy = 0
		self.state = "ground"
		result.landed = true
	end
end

function Player:_stepLadder(dt: number, c, result)
	local path = self.path
	if not path then
		self.state = "ground"
		return
	end
	local dir = (if c.up then 1 else 0) - (if c.down then 1 else 0)
	self.moving = dir ~= 0
	self.d += dir * PHYSICS.climbSpeed * dt

	if self.d >= path.length then
		if path.topS == nil then
			self.d = path.length
			result.reachedSummit = true
		else
			self:_leaveLadder(path.ladder.ring + 1, path.topS)
		end
	elseif self.d <= 0 then
		self:_leaveLadder(path.ladder.ring, path.bottomS)
	end
end

function Player:_enterLadder(path, d: number)
	self.state = "ladder"
	self.path = path
	self.d = d
	self.vs = 0
	self.vy = 0
end

function Player:_leaveLadder(ring: number, s: number)
	self.state = "ground"
	self.ring = ring
	self.s = s
	self.y = self.level:tierTop(ring)
	self.path = nil
	self.moving = false
end

function Player:_updatePosition()
	if self.path and self.state == "ladder" then
		self.px, self.py, self.pz = self.path.point(self.d)
		self.side = self.path.ladder.side
		return
	end
	local x, z, side = self.level:ringPoint(self.ring, self.s)
	self.px, self.py, self.pz = x, self.y, z
	self.side = side
end

return Player
