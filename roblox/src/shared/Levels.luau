-- Level definitions ported from src/levels/defs.ts. Spots are { ring, side, offset }: side 0..3 is the
-- south, east, north and west face, and offset is measured from the middle of that side.

local MEADOW = {
	name = "meadow",
	skin = "meadow",
	rings = 4,
	terraceDepth = 3,
	tierHeight = 4,
	summitHalf = 3,
	ladders = {
		{ ring = 0, side = 1, offset = 3 },
		{ ring = 0, side = 3, offset = -4 },
		{ ring = 1, side = 2, offset = -2 },
		{ ring = 1, side = 3, offset = 2 },
		{ ring = 2, side = 3, offset = 0 },
		{ ring = 3, side = 0, offset = 0 },
	},
	chutes = {
		{ ring = 1, side = 0, offset = -3 },
		{ ring = 2, side = 1, offset = -3 },
		{ ring = 3, side = 2, offset = 0 },
	},
	playerStart = { ring = 0, side = 0, offset = -9 },
	drum = { ring = 0, side = 0, offset = -12 },
	barrelSpawn = { ring = 3, side = 1, offset = 1 },
	items = {
		{ type = "gem", spot = { ring = 0, side = 0, offset = 0 } },
		{ type = "gem", spot = { ring = 0, side = 0, offset = -5 } },
		{ type = "hotdog", spot = { ring = 0, side = 1, offset = -6 } },
		{ type = "gem", spot = { ring = 1, side = 1, offset = 0 } },
		{ type = "hammer", spot = { ring = 1, side = 0, offset = 4 } },
		{ type = "oneup", spot = { ring = 2, side = 0, offset = -3 } },
		{ type = "gem", spot = { ring = 2, side = 3, offset = -4 } },
		{ type = "gem", spot = { ring = 3, side = 3, offset = 3 } },
		{ type = "hotdog", spot = { ring = 3, side = 2, offset = -2 } },
		{ type = "letter-1", spot = { ring = 0, side = 2, offset = 0 } },
		{ type = "letter-u", spot = { ring = 1, side = 3, offset = -7 } },
		{ type = "letter-p", spot = { ring = 3, side = 1, offset = -2 } },
	},
	totems = { { ring = 0, from = { 0, 3 }, to = { 0, 11 } } },
	patrols = {
		{ ring = 1, from = { 0, -6 }, to = { 0, 6 } },
		{ ring = 2, from = { 3, -5 }, to = { 0, 5 } },
		{ ring = 0, from = { 1, -8 }, to = { 1, 1 } },
		{ ring = 3, from = { 2, -3 }, to = { 3, -2 } },
	},
	ghosts = 1,
	fires = 1,
	pits = { { ring = 0, side = 0, offset = 0, width = 2 } },
	crumbles = {},
	conveyors = { { ring = 1, side = 1, offset = 7, width = 4, dir = -1 } },
	platforms = {},
	-- Ladder indexes are 1-based here (ladder 4 in the web build).
	locks = { { kind = "switch", ladder = 5, switchAt = { ring = 2, side = 1, offset = 3 } } },
}

return { MEADOW }
