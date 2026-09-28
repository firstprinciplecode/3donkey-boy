-- Pyramid geometry and ring coordinates, ported from src/level.ts.
--
-- Tier 0 is the ground terrace and tier `summitTier` the top. Ring k is the walkway on top of tier k,
-- outside tier k+1. A position on a ring is a distance `s` along its square path, growing when walking
-- right as seen from outside: south (+z) face, then east, north and west.

local Config = require(script.Parent.Config)

local LADDER_STANDOFF = 0.35

local Level = {}
Level.__index = Level

Level.BASE_DEPTH = 10
Level.PIT_DEPTH = 1

function Level.squarePoint(radius: number, side: number, offset: number): (number, number)
	if side == 0 then
		return offset, radius
	elseif side == 1 then
		return radius, -offset
	elseif side == 2 then
		return -offset, -radius
	end
	return -radius, offset
end

-- Inverse of squarePoint: which side a world (x, z) is on, its offset along that side and its radius.
function Level.squareCoords(x: number, z: number): (number, number, number)
	if z >= math.abs(x) then
		return 0, x, z
	elseif x >= math.abs(z) then
		return 1, -z, x
	elseif -z >= math.abs(x) then
		return 2, -x, -z
	end
	return 3, z, -x
end

function Level.new(def)
	local self = setmetatable({}, Level)
	self.def = def
	self.ringCount = def.rings
	self.summitTier = def.rings

	self.pits = {}
	for _, pit in def.pits do
		table.insert(self.pits, { ring = pit.ring, center = self:spotS(pit), half = pit.width / 2 })
	end

	-- Keyed by ring number (0-based, like the ring numbers in the level data).
	self.chuteByRing = {}
	for _, chute in def.chutes do
		self.chuteByRing[chute.ring] = chute
	end

	self.ladderPaths = {}
	for i, ladder in def.ladders do
		local path = self:_makeLadderPath(ladder, i)
		self.ladderPaths[i] = path
		if path.topS == nil then
			self.summitPath = path
		end
	end
	assert(self.summitPath, `Level "{def.name}" has no ladder to the summit`)
	return self
end

function Level:tierHalf(k: number): number
	return self.def.summitHalf + (self.summitTier - k) * self.def.terraceDepth
end

function Level:tierTop(k: number): number
	return k * self.def.tierHeight
end

function Level:ringRadius(k: number): number
	return self:tierHalf(k) - self.def.terraceDepth / 2
end

function Level:ringLength(k: number): number
	return 8 * self:ringRadius(k)
end

function Level:sOf(ring: number, side: number, offset: number): number
	local r = self:ringRadius(ring)
	return (side * 2 * r + r + offset) % (8 * r)
end

function Level:spotS(spot): number
	return self:sOf(spot.ring, spot.side, spot.offset)
end

function Level:ringSide(ring: number, s: number): (number, number)
	local r = self:ringRadius(ring)
	local ss = s % (8 * r)
	local side = math.min(3, math.floor(ss / (2 * r)))
	return side, ss - side * 2 * r - r
end

function Level:ringPoint(ring: number, s: number): (number, number, number)
	local side, offset = self:ringSide(ring, s)
	local x, z = Level.squarePoint(self:ringRadius(ring), side, offset)
	return x, z, side
end

function Level:ringDistance(ring: number, a: number, b: number): number
	local len = self:ringLength(ring)
	local d = (a - b) % len
	return math.min(d, len - d)
end

-- A stretch of ring from level data ({ ring, side, offset, width }).
function Level:span(def)
	return { ring = def.ring, center = self:spotS(def), half = def.width / 2, def = def }
end

function Level:inSpan(span, ring: number, s: number, margin: number?): boolean
	return span.ring == ring and self:ringDistance(ring, s, span.center) < span.half - (margin or 0)
end

-- True if moving `delta` from `prev` in direction `dir` (+1 = increasing s) passes `target`.
function Level:crossed(ring: number, prev: number, target: number, delta: number, dir: number): boolean
	return (dir * (target - prev)) % self:ringLength(ring) < delta
end

-- True where the walkway has a hole under this spot, so anything standing there drops.
function Level:overGap(ring: number, s: number): boolean
	local margin = Config.OBSTACLES.pitMargin
	for _, pit in self.pits do
		if pit.ring == ring and self:ringDistance(ring, s, pit.center) < pit.half - margin then
			return true
		end
	end
	return false
end

-- Walk in to the wall, climb straight up, step over the edge onto the next ring.
function Level:_makeLadderPath(ladder, index: number)
	local upper = ladder.ring + 1
	local wall = self:tierHalf(upper)
	local y0 = self:tierTop(ladder.ring)
	local y1 = self:tierTop(upper)
	local toSummit = upper == self.summitTier
	local rBottom = self:ringRadius(ladder.ring)
	local rFoot = wall + LADDER_STANDOFF
	local rTop = if toSummit then wall - 1.2 else self:ringRadius(upper)
	local a = rBottom - rFoot
	local b = y1 - y0
	local c = rFoot - rTop

	local path = {
		index = index,
		ladder = ladder,
		length = a + b + c,
		bottomS = self:spotS(ladder),
		topS = if toSummit then nil else self:sOf(upper, ladder.side, ladder.offset),
	}

	function path.point(d: number): (number, number, number)
		local r, y
		if d <= a then
			r, y = rBottom - d, y0
		elseif d <= a + b then
			r, y = rFoot, y0 + (d - a)
		else
			r, y = rFoot - (d - a - b), y1
		end
		local x, z = Level.squarePoint(r, ladder.side, ladder.offset)
		return x, y, z
	end

	function path.isVertical(d: number): boolean
		return d > a and d < a + b
	end

	return path
end

return Level
