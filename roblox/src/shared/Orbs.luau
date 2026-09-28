-- Bonus bubbles hover at jump height along each ring, ported from src/levels/orbs.ts. They're
-- generated (seeded by the level name, so every visit matches the web build) and keep clear of
-- ladders, the drum, the start and other items.

local Config = require(script.Parent.Config)
local Rand = require(script.Parent.Rand)

local ORBS = Config.ORBS

local Orbs = {}

local function avoid(list, spot, pad: number)
	table.insert(list, { ring = spot.ring, side = spot.side, offset = spot.offset, pad = pad })
end

function Orbs.spots(level)
	local def = level.def
	local seed = 7
	for i = 1, #def.name do
		seed = (seed * 31 + string.byte(def.name, i)) % 2 ^ 32
	end
	local rand = Rand.seeded(seed)

	local keepClear = {}
	for _, l in def.ladders do
		avoid(keepClear, l, 1.6)
		avoid(keepClear, { ring = l.ring + 1, side = l.side, offset = l.offset }, 1.6)
	end
	for _, it in def.items do
		avoid(keepClear, it.spot, 1.4)
	end
	avoid(keepClear, def.drum, 2.5)
	avoid(keepClear, def.playerStart, 2)

	local spots = {}
	for ring = 0, level.ringCount - 1 do
		local r = level:ringRadius(ring)
		local n, tries = 0, 0
		while n < ORBS.perRing and tries < 40 do
			tries += 1
			local side = math.floor(rand() * 4)
			local offset = math.floor((rand() * 2 - 1) * (r - 1.5) * 2 + 0.5) / 2
			local clash = false
			for _, a in keepClear do
				if a.ring == ring and a.side == side and math.abs(a.offset - offset) < a.pad then
					clash = true
					break
				end
			end
			if not clash then
				for _, s in spots do
					if s.ring == ring and s.side == side and math.abs(s.offset - offset) < 3 then
						clash = true
						break
					end
				end
			end
			if not clash then
				table.insert(spots, { ring = ring, side = side, offset = offset })
				n += 1
			end
		end
	end
	return spots
end

return Orbs
