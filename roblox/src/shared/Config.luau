local function hex(n: number): Color3
	return Color3.fromRGB(bit32.rshift(n, 16), bit32.band(bit32.rshift(n, 8), 0xff), bit32.band(n, 0xff))
end

local Config = {}

-- Gameplay runs in the web build's units; everything is scaled by this when placed in the world.
Config.STUD = 2

Config.hex = hex

Config.COLORS = {
	black = hex(0x1b1b22),
	charcoal = hex(0x2e2e38),
	grey = hex(0x45454f),
	grass = hex(0x9bd23c),
	grassDark = hex(0x74b52c),
	stone = hex(0x8a7d62),
	cream = hex(0xf4f1e6),
	pink = hex(0xff2f7a),
	orange = hex(0xff9a1f),
	yellow = hex(0xffd23a),
	red = hex(0xff3b3b),
	cyan = hex(0x6fe0da),
	teal = hex(0x2aa6a6),
	blue = hex(0x2d7fd8),
	purple = hex(0x8e4fd8),
}

local C = Config.COLORS
Config.RAINBOW = { C.red, C.orange, C.yellow, C.grass, C.teal, C.blue, C.purple }

Config.PLAYER_SIZE = { halfWidth = 0.32, height = 1.5 }

Config.BARREL = {
	radius = 0.42,
	baseSpeed = 5.2,
	ladderChance = 0.3,
	-- Chance a barrel reverses direction each time it lands on a lower ring.
	flipChance = 0.5,
	minInterval = 1.7,
	maxInterval = 3.4,
	maxAlive = 9,
}

Config.GHOST = { speed = 1.8, radius = 0.45 }

Config.FIRE = { speed = 2.3, radius = 0.38, ladderChance = 0.4, minTurn = 1.2, maxTurn = 3.5 }

Config.GAME_RULES = {
	lives = 3,
	bonusStart = 5000,
	bonusStep = 100,
	bonusInterval = 2,
}

Config.SCORE = {
	jumpBarrel = 100,
}

Config.BOSS_POS = { x = -1, z = 0 }

Config.PHYSICS = {
	gravity = -32,
	moveSpeed = 6.5,
	climbSpeed = 4.2,
	jumpVelocity = 10.5,
	ladderGrab = 0.5,
	substep = 1 / 120,
}

Config.OBSTACLES = {
	-- You only fall once your centre is this far past the lip of a pit.
	pitMargin = 0.2,
}

Config.CAMERA = {
	-- Angle from straight down; 60 gives the web build's isometric look.
	polarDeg = 60,
	yawBiasDeg = 14,
	turnDuration = 0.45,
	turnHysteresis = 0.35,
	-- Roblox has no orthographic camera, so a far camera with a narrow field of view stands in for one.
	distance = 140,
	minHalfHeight = 8.5,
	minHalfWidth = 11,
}

return Config
