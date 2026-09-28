-- Dynamic level pieces, ported from src/obstacles.ts: crumbling tiles, moving platforms, conveyor
-- belts, and ladders locked behind a switch gate or a key door. Ice, springs and relic doors join
-- when the levels that use them are ported.
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
-- Key doors float up and shrink away instead of sinking.
local DOOR_RISE = 2.5
local DOOR_SHRINK = 0.9
local LOCK_COLORS = { switch = C.red, key = C.pink }
local CRUMBLE_JITTER = 0.08
local CRUMBLE_DROP = 6
local CRUMBLE_COLORS = { Config.hex(0xc98f4e), C.tan }

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
	self.crumbles = {}
	self.platforms = {}
	self.conveyors = {}
	self.locks = {}
	self.lockByLadder = {}
	self.moveParts = {}
	self.moveFrames = {}
	self.clock = 0
	local def = level.def
	for _, c in def.crumbles do
		self:_addCrumble(c)
	end
	for _, p in def.platforms do
		self:_addPlatform(p)
	end
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

function Obstacles:destroy()
	self.folder:Destroy()
end

-- Tiles laid over the hole in the walkway, one per unit cell across the terrace.
function Obstacles:_addCrumble(def)
	local L = self.level
	local top = L:tierTop(def.ring)
	local inner = L:tierHalf(def.ring + 1)
	local outer = L:tierHalf(def.ring)
	local cells = {}
	local i = 0
	local u = def.offset - def.width / 2 + 0.5
	while u < def.offset + def.width / 2 do
		local r = inner + 0.5
		while r < outer do
			local x, z = Level.squarePoint(r, def.side, u)
			local base = unitFrame(x, top - 0.45, z)
			local part = Voxel.part(self.folder, Vector3.new(0.94, 0.9, 0.94), CRUMBLE_COLORS[i % 2 + 1])
			part.CFrame = base
			table.insert(cells, { part = part, base = base })
			r += 1
			i += 1
		end
		u += 1
	end
	table.insert(self.crumbles, { span = L:span(def), cells = cells, state = "intact", t = 0 })
end

function Obstacles:_addPlatform(def)
	local L = self.level
	local span = L:span(def)
	local depth = L.def.terraceDepth - 0.3
	local pw = def.platformWidth
	local pieces = {}
	local function add(sx, sy, sz, color, x, y, z)
		local part = Voxel.part(self.folder, Vector3.new(sx, sy, sz), color)
		table.insert(pieces, { part = part, at = unitFrame(x, y, z) })
	end
	add(pw, 0.3, depth, C.yellow, 0, -0.15, 0)
	add(pw + 0.04, 0.12, 0.2, C.pink, 0, -0.26, depth / 2 - 0.1)
	add(pw + 0.04, 0.12, 0.2, C.pink, 0, -0.26, -depth / 2 + 0.1)
	add(0.2, 0.5, 0.2, C.black, 0, -0.55, 0)
	table.insert(self.platforms, {
		span = span,
		def = def,
		pieces = pieces,
		amp = math.max(0, span.half - pw / 2 - 0.05),
		s = span.center,
		vel = 0,
	})
end

-- Sine back and forth across its gap; `vel` is what it carries you at.
function Obstacles:_movePlatform(p, t: number)
	local w = 2 * math.pi / p.def.period
	p.s = self.level:sOf(p.span.ring, p.def.side, p.def.offset + p.amp * math.sin(w * t))
	p.vel = p.amp * w * math.cos(w * t)
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
		local part = self:_box(frame, sx, sy, sz, col, x, y, z)
		table.insert(gate, { part = part, size = part.Size, offset = Vector3.new(x, y, z) })
	end
	local lock = { def = def, frame = frame, gate = gate, open = false, shown = true, t = 0 }
	if def.kind == "switch" then
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
		lock.cap = self:_box(sw, 0.55, 0.22, 0.55, C.red, 0, 0.23, 0)
		self:_box(sw, 0.06, 1.8, 0.06, C.cream, 0, 0.9, -0.9)
		lock.flag = self:_box(sw, 0.5, 0.32, 0.04, C.red, 0.27, 1.6, -0.9)
		lock.switchS = L:spotS(at)
		lock.switchFrame = sw
	else
		-- A candy door with a keyhole.
		add(1.4, 2.2, 0.26, color, 0, 1.1, 0)
		add(1.56, 0.16, 0.34, C.cream, 0, 2.2, 0)
		add(0.3, 0.3, 0.1, C.yellow, 0, 1.2, 0.16)
		add(0.12, 0.3, 0.1, C.yellow, 0, 0.95, 0.16)
	end
	table.insert(self.locks, lock)
	self.lockByLadder[def.ladder] = lock
end

-- `k` runs 0 (closed) to 1 (fully open): gates sink into the floor, doors float up and shrink.
function Obstacles:_placeGate(lock, k: number)
	local parts, frames = self.moveParts, self.moveFrames
	local isGate = lock.def.kind == "switch"
	local scale = if isGate then 1 else 1 - DOOR_SHRINK * k
	local base = lock.frame * unitFrame(0, if isGate then -GATE_SINK * k else DOOR_RISE * k, 0)
	for _, g in lock.gate do
		if not isGate then
			g.part.Size = g.size * scale
		end
		local o = g.offset * scale
		table.insert(parts, g.part)
		table.insert(frames, if lock.shown then base * unitFrame(o.X, o.Y, o.Z) else Voxel.HIDDEN)
	end
end

function Obstacles:_setSwitch(lock, on: boolean)
	if not lock.cap then
		return
	end
	local color = if on then C.grass else C.red
	lock.cap.Color = color
	lock.flag.Color = color
	lock.cap.CFrame = lock.switchFrame * unitFrame(0, if on then 0.14 else 0.23, 0)
end

-- `relock` also closes gates and doors (a new round); after a death only crumbles and platforms reset.
function Obstacles:reset(relock: boolean)
	self.clock = 0
	for _, c in self.crumbles do
		c.state = "intact"
		c.t = 0
	end
	for _, p in self.platforms do
		self:_movePlatform(p, 0)
	end
	self:_placeMovers()
	if not relock then
		self:_flush()
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

-- Opens every key door; returns true if any was closed.
function Obstacles:unlockKeyDoors(): boolean
	local any = false
	for _, lock in self.locks do
		if lock.def.kind == "key" and not lock.open then
			self:_openLock(lock)
			any = true
		end
	end
	return any
end

-- `player` is { ring, s, grounded }. Returns { crumbled = a tile started to give way,
-- switched = the switch's spot, or nil }.
function Obstacles:update(dt: number, player)
	local L = self.level
	self.clock += dt
	local events = { crumbled = false, switched = nil }
	for _, c in self.crumbles do
		if c.state == "intact" and player.grounded and L:inSpan(c.span, player.ring, player.s) then
			c.state = "shaking"
			c.t = 0
			events.crumbled = true
		end
		c.t += dt
		if c.state == "shaking" and c.t >= OBSTACLES.crumbleDelay then
			c.state = "falling"
			c.t = 0
		elseif c.state == "falling" and c.t >= OBSTACLES.crumbleFall then
			c.state = "gone"
		end
	end
	for _, p in self.platforms do
		self:_movePlatform(p, self.clock)
	end

	for _, lock in self.locks do
		local at = lock.def.switchAt
		if lock.def.kind == "switch" and not lock.open and player.grounded and player.ring == at.ring and L:ringDistance(player.ring, player.s, lock.switchS) < OBSTACLES.switchReach then
			self:_openLock(lock)
			events.switched = at
		end
		if lock.open and lock.shown then
			lock.t += dt
			local k = math.min(1, lock.t / GATE_OPEN_TIME)
			lock.shown = k < 1
			self:_placeGate(lock, k)
		end
	end
	self:_flush()
	return events
end

-- Crumble cells (shaking, dropping or hidden) and platforms, drawn once a frame.
function Obstacles:_placeMovers()
	local parts, frames = self.moveParts, self.moveFrames
	for _, c in self.crumbles do
		local state = c.state
		for _, cell in c.cells do
			table.insert(parts, cell.part)
			if state == "gone" then
				table.insert(frames, Voxel.HIDDEN)
			elseif state == "shaking" then
				local jx, jz = (math.random() - 0.5) * CRUMBLE_JITTER, (math.random() - 0.5) * CRUMBLE_JITTER
				table.insert(frames, unitFrame(jx, 0, jz) * cell.base)
			elseif state == "falling" then
				table.insert(frames, unitFrame(0, -CRUMBLE_DROP * c.t * c.t, 0) * cell.base)
			else
				table.insert(frames, cell.base)
			end
		end
	end
	local L = self.level
	for _, p in self.platforms do
		local ring = p.span.ring
		local x, z, side = L:ringPoint(ring, p.s)
		local root = CFrame.new(x * STUD, L:tierTop(ring) * STUD, z * STUD) * CFrame.Angles(0, side * math.pi / 2, 0)
		for _, piece in p.pieces do
			table.insert(parts, piece.part)
			table.insert(frames, root * piece.at)
		end
	end
end

-- Chevrons slide along the belt at the speed it carries you. Like the web's scrolling texture, each
-- arm is trimmed where it crosses either end of the belt, so they slide off and back on smoothly.
function Obstacles:render(dt: number)
	self:_placeMovers()
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
	local margin = OBSTACLES.pitMargin
	for _, c in self.crumbles do
		if (c.state == "falling" or c.state == "gone") and L:inSpan(c.span, ring, s, margin) then
			return nil
		end
	end
	for _, p in self.platforms do
		if L:inSpan(p.span, ring, s, margin) then
			return if math.abs(L:ringDelta(ring, s, p.s)) < p.def.platformWidth / 2 + 0.1 then p.vel else nil
		end
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
