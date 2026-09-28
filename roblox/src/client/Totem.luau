-- Spike totem from the poster, ported from src/entities/totem.ts. It plods along a stretch of ring
-- and every couple of seconds crouches and hops straight up. It's too tall to jump over: the way past
-- is to run underneath mid-hop, or smash it with the hammer.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("Shared").Config)

local Voxel = require(script.Parent.Voxel)

local C = Config.COLORS
local STUD = Config.STUD
local TOTEM = Config.TOTEM
local CONE_STEPS = 3

-- { group, size, centre in the group's frame, colour }. The face is on the outward (+z) side.
local PARTS = {}
local function add(group: string, sx: number, sy: number, sz: number, color: Color3, x: number, y: number, z: number)
	table.insert(PARTS, { group, Vector3.new(sx, sy, sz), Vector3.new(x, y, z), color })
end
-- Stepped stand-in for the web's cones, standing on `yBottom`.
local function cone(group: string, radius: number, height: number, color: Color3, x: number, yBottom: number, z: number, steps: number?)
	local n = steps or CONE_STEPS
	local step = height / n
	for i = 0, n - 1 do
		local w = 2 * radius * (1 - i / n)
		add(group, w, step, w, color, x, yBottom + (i + 0.5) * step, z)
	end
end

for i, x in { -0.22, 0.22 } do
	local leg = if i == 1 then "legL" else "legR"
	add(leg, 0.2, 0.55, 0.22, C.black, 0, 0, 0)
	add(leg, 0.28, 0.1, 0.34, C.cream, 0, -0.23, 0.04)
	add("pupil", 0.1, 0.12, 0.05, C.black, x, 1.3, 0.43)
end
add("body", 0.96, 1.1, 0.8, C.black, 0, 1.1, 0)
add("body", 0.76, 0.3, 0.66, C.charcoal, 0, 1.78, 0)
cone("body", 0.2, 0.62, C.cream, -0.26, 1.93, 0)
cone("body", 0.2, 0.62, C.cream, 0.26, 1.93, 0)
cone("body", 0.1, 0.3, C.pink, 0, 1.93, 0)
add("body", 0.26, 0.26, 0.04, C.pink, -0.22, 1.32, 0.41)
add("body", 0.26, 0.26, 0.04, C.pink, 0.22, 1.32, 0.41)
add("body", 0.58, 0.2, 0.04, C.red, 0, 0.88, 0.41)
for i = 0, 3 do
	cone("body", 0.06, 0.12, C.cream, -0.21 + i * 0.14, 0.9, 0.43, 2)
end

local LEG_X = { legL = -0.22, legR = 0.22 }

local Totem = {}
Totem.__index = Totem

function Totem.new(level, patrol, speed: number, parent: Instance)
	local self = setmetatable({}, Totem)
	self.level = level
	self.ring = patrol.ring
	self.s0 = level:sOf(patrol.ring, patrol.from[1], patrol.from[2])
	local s1 = level:sOf(patrol.ring, patrol.to[1], patrol.to[2])
	self.length = (s1 - self.s0) % level:ringLength(patrol.ring)
	self.speed = speed
	self.progress = self.length / 2
	self.dir = 1
	self.phase = "walk"
	self.phaseT = 0
	self.clock = TOTEM.hopEvery * (0.4 + math.random() * 0.6)
	self.t = math.random() * 10
	self.hop = 0
	self.squash = 0
	self.radius = TOTEM.radius
	-- Height of the hitbox bottom above the floor; the player fits underneath once this clears 1.5.
	self.clearance = 0
	self.scored = false
	-- True for the one update in which it lands, so the game can puff dust and shake the screen.
	self.landed = false
	-- Hit centres: the body, and a second sphere stacked on it so it can't be jumped.
	self.position = Vector3.zero
	self.head = Vector3.zero
	self.side = 0

	self.model = Instance.new("Model")
	self.model.Name = "Totem"
	self.parts = {}
	for _, spec in PARTS do
		table.insert(self.parts, Voxel.part(self.model, spec[2], spec[4]))
	end
	self.cframes = table.create(#self.parts)
	self:_place()
	self.model.Parent = parent
	return self
end

function Totem:isAirborne(): boolean
	return self.phase == "hop"
end

function Totem:destroy()
	self.model:Destroy()
end

function Totem:_enter(phase: string)
	self.phase = phase
	self.phaseT = 0
end

-- `env` answers `carry(ring, s)`, nil over a gap, so the totem turns back at pits.
function Totem:update(dt: number, env)
	local L = self.level
	self.t += dt
	self.phaseT += dt
	self.squash = 0
	self.landed = false
	if self.phase == "walk" then
		local nextProgress = self.progress + self.dir * self.speed * dt
		local ahead = (self.s0 + nextProgress + self.dir * 0.6) % L:ringLength(self.ring)
		if nextProgress > self.length or nextProgress < 0 or env:carry(self.ring, ahead) == nil then
			self.dir = -self.dir
		else
			self.progress = nextProgress
		end
		self.clock -= dt
		if self.clock <= 0 then
			self:_enter("crouch")
		end
	elseif self.phase == "crouch" then
		self.squash = math.min(1, self.phaseT / TOTEM.crouchTime)
		if self.phaseT >= TOTEM.crouchTime then
			self:_enter("hop")
		end
	else
		local u = self.phaseT / TOTEM.hopTime
		if u >= 1 then
			self:_enter("walk")
			self.clock = TOTEM.hopEvery * (0.8 + math.random() * 0.4)
			self.scored = false
			self.landed = true
		end
		self.hop = if u >= 1 then 0 else math.sin(u * math.pi) * TOTEM.hopHeight
	end
	if self.phase ~= "hop" then
		self.hop = 0
	end
	self:_place()
end

function Totem:_place()
	local L = self.level
	local x, z, side = L:ringPoint(self.ring, (self.s0 + self.progress) % L:ringLength(self.ring))
	local y = L:tierTop(self.ring) + self.hop
	self.side = side
	self.base = Vector3.new(x, y, z)
	self.clearance = self.hop + 0.35
	self.position = Vector3.new(x, y + 0.95, z)
	self.head = Vector3.new(x, y + 1.75, z)
end

function Totem:render()
	local walking = self.phase == "walk"
	local stride = if walking then math.sin(self.t * 9) else 0
	local lift = { legL = math.max(0, stride) * 0.12, legR = math.max(0, -stride) * 0.12 }
	-- Legs tuck up mid-hop.
	local tuck = if self.phase == "hop" then 0.12 else 0
	local k = self.squash
	local sx, sy = 1 + k * 0.12, 1 - k * 0.18
	local root = CFrame.new(self.base * STUD) * CFrame.Angles(0, self.side * math.pi / 2, 0)
	local body = root * CFrame.Angles(0, 0, if walking then math.sin(self.t * 9) * 0.04 else 0)
	for i, spec in PARTS do
		local group, at = spec[1], spec[3]
		local frame
		if group == "body" or group == "pupil" then
			local px = if group == "pupil" then at.X + self.dir * 0.06 else at.X
			frame = body * CFrame.new(px * sx * STUD, at.Y * sy * STUD, at.Z * sx * STUD)
		else
			frame = root * CFrame.new((LEG_X[group] + at.X) * STUD, (0.28 + lift[group] + tuck + at.Y) * STUD, at.Z * STUD)
		end
		self.cframes[i] = frame
	end
	workspace:BulkMoveTo(self.parts, self.cframes, Enum.BulkMoveMode.FireCFrameChanged)
end

return Totem
