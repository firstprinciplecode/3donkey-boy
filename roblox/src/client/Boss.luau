-- The black, cone-horned monster on the summit that lobs barrels, ported from src/entities/boss.ts.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("Shared").Config)

local Voxel = require(script.Parent.Voxel)

local STUD = Config.STUD
local C = Config.COLORS
local THROW_DURATION = 0.75

local ARM_PIVOTS = {
	armL = Vector3.new(-1.45, 1.7, 0),
	armR = Vector3.new(1.45, 1.7, 0),
}

-- { group, size, centre in the group's frame, colour }. The legs stay put; the body bobs; arms swing.
local PARTS = {
	{ "root", Vector3.new(0.7, 1, 0.8), Vector3.new(-0.65, 0.5, 0), C.black },
	{ "root", Vector3.new(0.7, 1, 0.8), Vector3.new(0.65, 0.5, 0), C.black },
	{ "body", Vector3.new(2.4, 2, 1.8), Vector3.new(0, 1, 0), C.black },
	-- The web build's cone horns, stepped.
	{ "body", Vector3.new(0.56, 0.55, 0.56), Vector3.new(-0.7, 2.275, 0), C.cream },
	{ "body", Vector3.new(0.3, 0.55, 0.3), Vector3.new(-0.7, 2.825, 0), C.cream },
	{ "body", Vector3.new(0.56, 0.55, 0.56), Vector3.new(0.7, 2.275, 0), C.cream },
	{ "body", Vector3.new(0.3, 0.55, 0.3), Vector3.new(0.7, 2.825, 0), C.cream },
	{ "body", Vector3.new(0.5, 0.3, 0.5), Vector3.new(0, 2.15, 0.3), C.pink },
	{ "body", Vector3.new(0.45, 0.45, 0.1), Vector3.new(-0.55, 1.45, 0.91), C.pink },
	{ "body", Vector3.new(0.45, 0.45, 0.1), Vector3.new(0.55, 1.45, 0.91), C.pink },
	{ "body", Vector3.new(0.16, 0.16, 0.05), Vector3.new(-0.5, 1.4, 0.97), C.black },
	{ "body", Vector3.new(0.16, 0.16, 0.05), Vector3.new(0.6, 1.4, 0.97), C.black },
	{ "body", Vector3.new(1.6, 0.6, 0.1), Vector3.new(0, 0.6, 0.91), C.charcoal },
}
for i = 0, 5 do
	local x = -0.6 + i * 0.24
	table.insert(PARTS, { "body", Vector3.new(0.14, 0.22, 0.06), Vector3.new(x, 0.78, 0.97), C.cream })
	table.insert(PARTS, { "body", Vector3.new(0.14, 0.18, 0.06), Vector3.new(x + 0.12, 0.42, 0.97), C.cream })
end
for arm in ARM_PIVOTS do
	table.insert(PARTS, { arm, Vector3.new(0.55, 1.4, 0.7), Vector3.new(0, -0.65, 0), C.black })
	table.insert(PARTS, { arm, Vector3.new(0.68, 0.5, 0.8), Vector3.new(0, -1.45, 0), C.charcoal })
end

local Boss = {}
Boss.__index = Boss

function Boss.new(parent: Instance, level)
	local self = setmetatable({}, Boss)
	self.model = Instance.new("Model")
	self.model.Name = "Boss"
	self.parts = {}
	self.entries = {}
	for _, spec in PARTS do
		table.insert(self.parts, Voxel.part(self.model, spec[2], spec[4]))
		table.insert(self.entries, { group = spec[1], offset = CFrame.new(spec[3] * STUD) })
	end
	self.cframes = table.create(#self.parts)
	self.frames = {}

	-- Faces +x, towards the barrel spawn on the east side of the top ring.
	local summitY = level:tierTop(level.summitTier)
	self.root = CFrame.new(Vector3.new(Config.BOSS_POS.x, summitY, Config.BOSS_POS.z) * STUD) * CFrame.Angles(0, math.pi / 2, 0)

	self.throwT = -1
	self.released = false
	self.t = 0
	self.model.Parent = parent
	return self
end

function Boss:isBusy(): boolean
	return self.throwT >= 0
end

function Boss:playThrow()
	if self:isBusy() then
		return
	end
	self.throwT = 0
	self.released = false
end

-- Returns true on the frame the barrel should leave the boss's hand.
function Boss:update(dt: number): boolean
	self.t += dt
	local release = false
	local armL, armR

	if self.throwT >= 0 then
		self.throwT += dt
		local k = math.min(1, self.throwT / THROW_DURATION)
		local lift = if k < 0.5 then math.sin((k / 0.5) * (math.pi / 2)) else 1 - (k - 0.5) / 0.5
		armR = lift * 2.6
		armL = -lift * 0.8
		if not self.released and k >= 0.5 then
			self.released = true
			release = true
		end
		if k >= 1 then
			self.throwT = -1
		end
	else
		local sway = math.sin(self.t * 3) * 0.12
		armL = -0.15 - sway
		armR = 0.15 + sway
	end

	local bodyY = 1 + math.abs(math.sin(self.t * 3)) * 0.08
	local frames = self.frames
	frames.root = self.root
	frames.body = self.root * CFrame.new(0, bodyY * STUD, 0)
	frames.armL = frames.body * CFrame.new(ARM_PIVOTS.armL * STUD) * CFrame.Angles(0, 0, armL)
	frames.armR = frames.body * CFrame.new(ARM_PIVOTS.armR * STUD) * CFrame.Angles(0, 0, armR)
	for i, entry in self.entries do
		self.cframes[i] = frames[entry.group] * entry.offset
	end
	workspace:BulkMoveTo(self.parts, self.cframes, Enum.BulkMoveMode.FireCFrameChanged)
	return release
end

return Boss
