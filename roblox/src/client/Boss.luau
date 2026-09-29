-- The monster on the summit that lobs barrels, ported from src/entities/boss.ts. Each level skin has
-- its own look (shared/BossLooks); the throw and the sway are the same for all of them.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local BossLooks = require(Shared.BossLooks)
local Config = require(Shared.Config)

local Voxel = require(script.Parent.Voxel)

local STUD = Config.STUD
local THROW_DURATION = 0.75

local ARM_PIVOTS = {
	armL = Vector3.new(-1.45, 1.7, 0),
	armR = Vector3.new(1.45, 1.7, 0),
}

local Boss = {}
Boss.__index = Boss

function Boss.new(parent: Instance, level)
	local self = setmetatable({}, Boss)
	self.model = Instance.new("Model")
	self.model.Name = "Boss"
	self.parts = {}
	self.entries = {}
	self.cframes = {}
	self.frames = {}
	self.look = nil
	self:setLevel(level)

	self.throwT = -1
	self.released = false
	self.t = 0
	self.model.Parent = parent
	return self
end

-- Rebuilds the monster for another skin. Cones become two stepped blocks, as elsewhere in the port.
function Boss:_build(look: string)
	for _, part in self.parts do
		part:Destroy()
	end
	table.clear(self.parts)
	table.clear(self.entries)
	table.clear(self.cframes)
	local function add(group: string, size: Vector3, centre: Vector3, color: Color3, glow: boolean)
		local part = Voxel.part(self.model, size, color)
		part.CastShadow = false
		if glow then
			part.Material = Enum.Material.Neon
		end
		table.insert(self.parts, part)
		table.insert(self.entries, { group = group, offset = CFrame.new(centre * STUD) })
	end
	for _, spec in BossLooks[look] or BossLooks.meadow do
		if spec.cone then
			local r, h = spec.s.X, spec.s.Y
			local base = spec.p
			add(spec.g, Vector3.new(2 * r * 0.8, h / 2, 2 * r * 0.8), base + Vector3.new(0, h / 4, 0), spec.c, spec.glow)
			add(spec.g, Vector3.new(2 * r * 0.43, h / 2, 2 * r * 0.43), base + Vector3.new(0, 3 * h / 4, 0), spec.c, spec.glow)
		else
			add(spec.g, spec.s, spec.p, spec.c, spec.glow)
		end
	end
end

-- Stands on the level's summit, facing +x towards the barrel spawn on the east side of the top ring.
function Boss:setLevel(level)
	local look = level.def.skin
	if look ~= self.look then
		self.look = look
		self:_build(look)
	end
	local summitY = level:tierTop(level.summitTier)
	self.root = CFrame.new(Vector3.new(Config.BOSS_POS.x, summitY, Config.BOSS_POS.z) * STUD) * CFrame.Angles(0, math.pi / 2, 0)
	self.throwT = -1
	self.released = false
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
