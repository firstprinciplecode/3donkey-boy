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
	leaf = hex(0x5fa02a),
	leafDark = hex(0x2f6b25),
	stone = hex(0x8a7d62),
	stoneDark = hex(0x6a5f49),
	sand = hex(0xd9c9a0),
	cream = hex(0xf4f1e6),
	creamDark = hex(0xdcd6c2),
	pink = hex(0xff2f7a),
	magenta = hex(0xd81b60),
	orange = hex(0xff9a1f),
	yellow = hex(0xffd23a),
	red = hex(0xff3b3b),
	cyan = hex(0x6fe0da),
	teal = hex(0x2aa6a6),
	blue = hex(0x2d7fd8),
	purple = hex(0x8e4fd8),
	brown = hex(0x7a4a2a),
	tan = hex(0xe8b26a),
	snow = hex(0xf7fbff),
	snowShade = hex(0xdbe8f2),
	ice = hex(0xbfe9f5),
	iceDark = hex(0x8fcfe6),
	maple = hex(0xe8612c),
	rust = hex(0xb8471f),
	gold = hex(0xf2b632),
	lava = hex(0xff5a1f),
	basalt = hex(0x3a3440),
	basaltDark = hex(0x2a2530),
	sandstone = hex(0xe0b878),
	sandstoneDark = hex(0xc79a5c),
	mint = hex(0x8ef0c8),
	mintDark = hex(0x4fc9a0),
	lime = hex(0xc6f03a),
	limeDark = hex(0x8cc21e),
	neon = hex(0xff4fd8),
	violet = hex(0x6a2fd8),
	terracotta = hex(0xd9673a),
	water = hex(0x3fd6ff),
	white = hex(0xffffff),
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

Config.HAMMER = { duration = 9, warnAt = 2.5 }

Config.ORBS = { perRing = 2, height = 2.1, radius = 0.34 }

Config.ITEM_RADIUS = 0.45

Config.GAME_RULES = {
	lives = 3,
	maxLives = 6,
	bonusStart = 5000,
	bonusStep = 100,
	bonusInterval = 2,
}

Config.SCORE = {
	jumpBarrel = 100,
	gem = 50,
	hotdog = 300,
	smashBarrel = 300,
	smashFire = 500,
	smashGhost = 500,
	letter = 100,
	spelled = 3000,
	orb = 100,
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
