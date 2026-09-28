-- Dynamic level pieces, ported from src/obstacles.ts: conveyor belts and switch-gated ladders so far.
-- Crumbling tiles, moving platforms, ice, springs and key or relic doors join when the levels that
-- use them are ported.
--
-- `carry` answers what's under a spot on a ring: nil for an open gap (you fall), otherwise the speed
-- along s the floor carries you at (0 for plain floor).

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Level = require(Shared.Level)

local Voxel = require(script.Parent.Voxel)

local C = Config.COLORS
local OBSTACLES = Config.OBSTACLES
local STUD = Config.STUD

local GATE_OPEN_TIME = 0.6
local GATE_SINK = 2.2
local LOCK_COLORS = { switch = C.red }

-- The yellow chevron printed once per unit of belt, as its two arms (from the web's belt texture).
local CHEVRON_TIP, CHEVRON_TAIL, CHEVRON_REACH = 0.656, 0.281, 0.375
local CHEVRON_WIDTH = 0.16

local function unitFrame(x: number, y: number, z: number): CFrame
	return CFrame.new(x * STUD, y * STUD, z * STUD)
end

local Obstacles = {}
Obstacles.__index = Obstacles

function Obstacles.new(level, parent: Instance)
	local self = setmetatable({}, Obstacles)
	self.level = level
	self.folder = Instance.new("Folder")
	self.folder.Name = "Obstacles"
	self.conveyors = {}
	self.locks = {}
	self.lockByLadder = {}
	self.moveParts = {}
	self.moveFrames = {}
	local def = level.def
	for _, c in def.conveyors do
		self:_addConveyor(c)
	end
	for _, l in def.locks do
		self:_addLock(l)
	end
	self:reset(true)
	self.folder.Parent = parent
	return self
end

-- A frame sitting on the walkway at a ring spot, local +x along increasing s and +z outward.
function Obstacles:_anchor(ring: number, side: number, offset: number, radius: number?): CFrame
	local L = self.level
	local x, z = Level.squarePoint(radius or L:ringRadius(ring), side, offset)
	return CFrame.new(x * STUD, L:tierTop(ring) * STUD, z * STUD) * CFrame.Angles(0, side * math.pi / 2, 0)
end

function Obstacles:_box(frame: CFrame, sx: number, sy: number, sz: number, color: Color3, x: number, y: number, z: number): (Part, CFrame)
	local part = Voxel.part(self.folder, Vector3.new(sx, sy, sz), color)
	local at = unitFrame(x, y, z)
	part.CFrame = frame * at
	return part, at
end

function Obstacles:_addConveyor(c)
	local depth = self.level.def.terraceDepth - 0.5
	local frame = self:_anchor(c.ring, c.side, c.offset)
	if c.dir < 0 then
		frame *= CFrame.Angles(0, math.pi, 0)
	end
	self:_box(frame, c.width, 0.06, depth, C.charcoal, 0, 0.03, 0)
	self:_box(frame, c.width + 0.1, 0.14, 0.12, C.grey, 0, 0.05, depth / 2 + 0.06)
	self:_box(frame, c.width + 0.1, 0.14, 0.12, C.grey, 0, 0.05, -depth / 2 - 0.06)

	local reach = CHEVRON_REACH * depth
	local du = CHEVRON_TIP - CHEVRON_TAIL
	local armLength = math.sqrt(du * du + reach * reach)
	local armYaw = math.atan2(reach, du)
	-- One chevron more than fits, so one is always sliding off the far end while another slides on.
	local arms = {}
	for _ = 0, c.width do
		for _, sign in { 1, -1 } do
			local part = Voxel.part(self.folder, Vector3.new(armLength, 0.02, CHEVRON_WIDTH), C.yellow)
			table.insert(arms, { part = part, sign = sign, length = armLength })
		end
	end
	table.insert(self.conveyors, {
		span = self.level:span(c),
		dir = c.dir,
		frame = frame,
		width = c.width,
		arms = arms,
		armYaw = armYaw,
		armLength = armLength,
		reach = reach,
		phase = 0,
	})
end

function Obstacles:_addLock(def)
	local L = self.level
	local ladder = L.def.ladders[def.ladder]
	local wall = L:tierHalf(ladder.ring + 1)
	local frame = self:_anchor(ladder.ring, ladder.side, ladder.offset, wall + 0.8)
	local color = LOCK_COLORS[def.kind]
	assert(color, `Lock kind "{def.kind}" isn't ported yet`)

	local gate = {}
	local function add(sx, sy, sz, col, x, y, z)
		local part, at = self:_box(frame, sx, sy, sz, col, x, y, z)
		table.insert(gate, { part = part, at = at })
	end
	add(0.14, 2, 0.14, color, -0.65, 1, 0)
	add(0.14, 2, 0.14, color, 0.65, 1, 0)
	for y = 0.35, 1.99, 0.4 do
		add(1.3, 0.08, 0.08, C.yellow, 0, y, 0)
	end
	for _, x in { -0.33, 0, 0.33 } do
		add(0.07, 1.9, 0.07, C.yellow, x, 0.95, 0)
	end

	local at = def.switchAt
	local sw = self:_anchor(at.ring, at.side, at.offset)
	self:_box(sw, 0.9, 0.12, 0.9, C.charcoal, 0, 0.06, 0)
	local cap = self:_box(sw, 0.55, 0.22, 0.55, C.red, 0, 0.23, 0)
	self:_box(sw, 0.06, 1.8, 0.06, C.cream, 0, 0.9, -0.9)
	local flag = self:_box(sw, 0.5, 0.32, 0.04, C.red, 0.27, 1.6, -0.9)

	local lock = {
		def = def,
		frame = frame,
		gate = gate,
		open = false,
		shown = true,
		t = 0,
		switchS = L:spotS(at),
		switchFrame = sw,
		cap = cap,
		flag = flag,
	}
	table.insert(self.locks, lock)
	self.lockByLadder[def.ladder] = lock
end

function Obstacles:_placeGate(lock, sink: number)
	local parts, frames = self.moveParts, self.moveFrames
	local base = lock.frame * unitFrame(0, -sink, 0)
	for _, g in lock.gate do
		table.insert(parts, g.part)
		table.insert(frames, if lock.shown then base * g.at else Voxel.HIDDEN)
	end
end

function Obstacles:_setSwitch(lock, on: boolean)
	local color = if on then C.grass else C.red
	lock.cap.Color = color
	lock.flag.Color = color
	lock.cap.CFrame = lock.switchFrame * unitFrame(0, if on then 0.14 else 0.23, 0)
end

-- `relock` also closes gates (a new round); after a death they stay as they were.
function Obstacles:reset(relock: boolean)
	if not relock then
		return
	end
	for _, lock in self.locks do
		lock.open = false
		lock.shown = true
		lock.t = 0
		self:_setSwitch(lock, false)
		self:_placeGate(lock, 0)
	end
	self:_flush()
end

function Obstacles:_openLock(lock)
	lock.open = true
	lock.t = 0
	self:_setSwitch(lock, true)
end

-- `player` is { ring, s, grounded }. Returns { switched = the switch's spot, or nil }.
function Obstacles:update(dt: number, player)
	local L = self.level
	local events = { switched = nil }
	for _, lock in self.locks do
		local at = lock.def.switchAt
		if not lock.open and player.grounded and player.ring == at.ring and L:ringDistance(player.ring, player.s, lock.switchS) < OBSTACLES.switchReach then
			self:_openLock(lock)
			events.switched = at
		end
		if lock.open and lock.shown then
			lock.t += dt
			local k = math.min(1, lock.t / GATE_OPEN_TIME)
			lock.shown = k < 1
			self:_placeGate(lock, GATE_SINK * k)
		end
	end
	self:_flush()
	return events
end

-- Chevrons slide along the belt at the speed it carries you. Like the web's scrolling texture, each
-- arm is trimmed where it crosses either end of the belt, so they slide off and back on smoothly.
function Obstacles:render(dt: number)
	local parts, frames = self.moveParts, self.moveFrames
	local du = CHEVRON_TIP - CHEVRON_TAIL
	for _, c in self.conveyors do
		local cells = c.width + 1
		c.phase = (c.phase + OBSTACLES.conveyorSpeed * dt) % cells
		local halfWidth = c.width / 2
		for i, arm in c.arms do
			local origin = ((i - 1) // 2 + c.phase) % cells - halfWidth - 1
			-- Each arm runs from its tail (t = 0, at the belt's edge) to the tip (t = 1, on the centre line).
			local tail = origin + CHEVRON_TAIL
			local t0 = math.clamp((-halfWidth - tail) / du, 0, 1)
			local t1 = math.clamp((halfWidth - tail) / du, 0, 1)
			table.insert(parts, arm.part)
			if t1 - t0 < 0.02 then
				table.insert(frames, Voxel.HIDDEN)
			else
				local length = c.armLength * (t1 - t0)
				if math.abs(length - arm.length) > 1e-3 then
					arm.length = length
					arm.part.Size = Vector3.new(length * STUD, 0.02 * STUD, CHEVRON_WIDTH * STUD)
				end
				local tm = (t0 + t1) / 2
				local x = tail + tm * du
				local z = arm.sign * c.reach * (1 - tm)
				local at = CFrame.new(x * STUD, 0.07 * STUD, z * STUD) * CFrame.Angles(0, arm.sign * c.armYaw, 0)
				table.insert(frames, c.frame * at)
			end
		end
	end
	self:_flush()
end

function Obstacles:_flush()
	if #self.moveParts > 0 then
		workspace:BulkMoveTo(self.moveParts, self.moveFrames, Enum.BulkMoveMode.FireCFrameChanged)
		table.clear(self.moveParts)
		table.clear(self.moveFrames)
	end
end

function Obstacles:carry(ring: number, s: number): number?
	local L = self.level
	if L:overGap(ring, s) then
		return nil
	end
	for _, c in self.conveyors do
		if L:inSpan(c.span, ring, s) then
			return c.dir * OBSTACLES.conveyorSpeed
		end
	end
	return 0
end

function Obstacles:isLadderOpen(index: number): boolean
	local lock = self.lockByLadder[index]
	return lock == nil or lock.open
end

function Obstacles:lockKind(index: number): string?
	local lock = self.lockByLadder[index]
	return if lock and not lock.open then lock.def.kind else nil
end

return Obstacles
