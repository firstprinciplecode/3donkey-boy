-- The climber's look and animation, built from boxes like the web build's voxel rig.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Util = require(Shared.Util)

local Voxel = require(script.Parent.Voxel)

local STUD = Config.STUD
local C = Config.COLORS

local LIMB_PIVOTS = {
	legL = Vector3.new(-0.14, 0.45, 0),
	legR = Vector3.new(0.14, 0.45, 0),
	armL = Vector3.new(-0.37, 0.92, 0),
	armR = Vector3.new(0.37, 0.92, 0),
}

-- { limb or false, size, offset from the limb pivot (or the feet), colour, transparency, is hammer }
local PARTS = {
	{ "armR", Vector3.new(0.08, 0.08, 0.7), Vector3.new(0, -0.38, 0.35), C.brown, 0, true },
	{ "armR", Vector3.new(0.3, 0.3, 0.46), Vector3.new(0, -0.38, 0.75), C.charcoal, 0, true },
	{ "legL", Vector3.new(0.2, 0.45, 0.24), Vector3.new(0, -0.225, 0), C.charcoal, 0 },
	{ "legR", Vector3.new(0.2, 0.45, 0.24), Vector3.new(0, -0.225, 0), C.charcoal, 0 },
	{ "armL", Vector3.new(0.16, 0.44, 0.2), Vector3.new(0, -0.2, 0), C.yellow, 0 },
	{ "armR", Vector3.new(0.16, 0.44, 0.2), Vector3.new(0, -0.2, 0), C.yellow, 0 },
	{ false, Vector3.new(0.56, 0.5, 0.4), Vector3.new(0, 0.71, 0), C.orange, 0 },
	{ false, Vector3.new(0.58, 0.08, 0.42), Vector3.new(0, 0.5, 0), C.pink, 0 },
	{ false, Vector3.new(0.4, 0.36, 0.36), Vector3.new(0, 1.18, 0), C.cream, 0 },
	{ false, Vector3.new(0.07, 0.1, 0.02), Vector3.new(-0.09, 1.2, 0.185), C.black, 0 },
	{ false, Vector3.new(0.07, 0.1, 0.02), Vector3.new(0.09, 1.2, 0.185), C.black, 0 },
	{ false, Vector3.new(0.42, 0.1, 0.38), Vector3.new(0, 1.38, 0), C.orange, 0 },
	{ false, Vector3.new(0.62, 0.52, 0.56), Vector3.new(0, 1.22, 0), C.cyan, 0.6 },
}

local Rig = {}
Rig.__index = Rig

function Rig.new(parent: Instance)
	local self = setmetatable({}, Rig)
	self.model = Instance.new("Model")
	self.model.Name = "Climber"
	self.parts = {}
	self.entries = {}
	for _, spec in PARTS do
		table.insert(self.parts, Voxel.part(self.model, spec[2], spec[4], spec[5]))
		table.insert(self.entries, { limb = spec[1], offset = CFrame.new(spec[3] * STUD), hammer = spec[6] == true })
	end
	self.pivots = {}
	for limb, pivot in LIMB_PIVOTS do
		self.pivots[limb] = CFrame.new(pivot * STUD)
	end
	self.angles = { legL = 0, legR = 0, armL = 0, armR = 0 }
	self.animT = 0
	self.deathT = 0
	self.heading = math.pi / 2
	self.tilt = 0
	self.cframes = table.create(#self.parts)
	self.model.Parent = parent
	return self
end

function Rig:snap(player)
	self.heading = player.side * math.pi / 2 + math.pi / 2
	self.tilt = 0
	self.deathT = 0
	for limb in self.angles do
		self.angles[limb] = 0
	end
end

function Rig:update(dt: number, player)
	self.animT += dt
	local hop = 0

	if player.state == "dead" then
		self.deathT += dt
		if self.deathT < 1 then
			self.heading += dt * 16
		else
			self.tilt = Util.damp(self.tilt, math.pi / 2, 10, dt)
		end
		if self.deathT < 0.6 and not player.inPit then
			hop = math.sin(self.deathT / 0.6 * math.pi)
		end
	else
		local yaw = player.side * math.pi / 2
		local target = if player.state == "ladder"
			then yaw + math.pi
			else yaw + (if player.facing > 0 then math.pi / 2 else -math.pi / 2)
		self.heading = Util.dampAngle(self.heading, target, 16, dt)

		local legL, legR, armL, armR = 0, 0, 0, 0
		if player:isWalking() then
			local s = math.sin(self.animT * 14) * 0.7
			legL, legR, armL, armR = s, -s, -s, s
		elseif player.state == "ladder" and player:onVerticalPart() then
			local s = if player.moving then math.sin(self.animT * 10) else 0
			armL, armR = -2.6 + s * 0.4, -2.6 - s * 0.4
			legL, legR = s * 0.5, -s * 0.5
		elseif player.state == "swing" then
			legL, legR, armL, armR = 0.35, -0.25, -3, -3
		elseif player.state == "air" then
			legL, legR, armL, armR = 0.7, -0.5, -2.4, -2.4
		end
		if player.hasHammer then
			armR = -1.6 + math.sin(self.animT * 16) * 1.3
		end
		local a = self.angles
		a.legL = Util.damp(a.legL, legL, 24, dt)
		a.legR = Util.damp(a.legR, legR, 24, dt)
		a.armL = Util.damp(a.armL, armL, 24, dt)
		a.armR = Util.damp(a.armR, armR, 24, dt)
	end

	local feet = Vector3.new(player.px, player.py + hop, player.pz) * STUD
	local root = CFrame.new(feet) * CFrame.Angles(0, self.heading, 0) * CFrame.Angles(0, 0, self.tilt)
	local showHammer = player.hasHammer and not player.hammerBlink
	for i, entry in self.entries do
		if entry.hammer and not showHammer then
			self.cframes[i] = Voxel.HIDDEN
		elseif entry.limb then
			self.cframes[i] = root * self.pivots[entry.limb] * CFrame.Angles(self.angles[entry.limb], 0, 0) * entry.offset
		else
			self.cframes[i] = root * entry.offset
		end
	end
	workspace:BulkMoveTo(self.parts, self.cframes, Enum.BulkMoveMode.FireCFrameChanged)
end

return Rig
