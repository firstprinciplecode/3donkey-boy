local Config = require(script.Parent.Config)

local hex = Config.hex
local C = Config.COLORS

return {
	meadow = {
		-- One style per tier from the ground up; the last is the summit.
		tiers = {
			{ top = C.grass, side = C.stone },
			{ top = C.cream, side = C.teal },
			{ top = C.charcoal, side = C.pink },
			{ top = C.grass, side = C.stone },
			{ top = C.red, side = C.charcoal },
		},
		ground = hex(0x74b52c),
		ladderRail = C.yellow,
		ladderRung = C.cream,
		pitFloor = C.black,
		spike = C.grey,
		goal = C.grass,
	},
}
