local function hex(n: number): Color3
	return Color3.fromRGB(bit32.rshift(n, 16), bit32.band(bit32.rshift(n, 8), 0xff), bit32.band(n, 0xff))
end

local Config = {}

-- Gameplay runs in the web build's units; everything is scaled by this when placed in the world.
-- 4 makes a terrace about two and a half Roblox avatars deep, so a real avatar fits the pyramid.
Config.STUD = 4

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

-- Free roam: the player's own avatar walks the pyramid with Roblox's controls and camera, on an
-- invisible collision shell, instead of the scripted climber on the rings. Sizes are in studs.
-- The avatar runs at the scripted climber's pace (PHYSICS.moveSpeed), so barrels stay as hard to dodge.
Config.FREE_ROAM = {
	enabled = true,
	-- Roblox's default; clears a barrel but stays under the shortest tier (12 studs), so ladders
	-- are the only way up.
	jumpHeight = 7.2,
	-- The rail round the ground terrace, well over a jump.
	railHeight = 30,
}

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

-- What the boss throws, per skin (shapes are in Projectiles). Chutes, ladders and pits work the same
-- for all; `scale` is the radius as a multiple of BARREL.radius, `speed` multiplies the roll, and
-- `hop` bounces it (arc height, and ring distance covered per bounce).
Config.PROJECTILES = {
	barrel = { scale = 1, speed = 1, burst = { C.cream, C.yellow, C.orange } },
	gumball = {
		scale = 1,
		speed = 1,
		burst = { C.pink, C.cyan, C.yellow },
		colors = { C.pink, C.cyan, C.yellow, C.purple, C.red, C.teal },
	},
	tumbleweed = { scale = 1.1, speed = 1.05, hop = { height = 0.55, every = 2.8 }, burst = { C.tan, C.sand, C.brown } },
	-- Grows as it rolls, up to maxScale after rolling `distance`; bigger ones pay more to jump.
	snowball = { scale = 1, speed = 1, grow = { maxScale = 1.85, distance = 40 }, burst = { C.snow, C.snowShade, C.ice } },
	-- Big and slow, so it's under you for longer when you jump it.
	boulder = { scale = 1.45, speed = 0.9, burst = { C.sandstone, C.sandstoneDark, C.tan } },
	-- Leaves a burning patch for `life` seconds wherever it lands off a chute.
	lavarock = { scale = 1, speed = 1, scorch = { life = 3 }, burst = { C.lava, C.orange, C.basalt } },
	-- Splits in two (each this much smaller, rolling opposite ways) the first time it drops off a chute.
	pumpkin = { scale = 1.15, speed = 0.95, splits = { scale = 0.75 }, burst = { C.orange, C.maple, C.yellow } },
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
	maxSpeedMul = 1.8,
}

Config.SCORE = {
	jumpBarrel = 100,
	gem = 50,
	hotdog = 300,
	smashBarrel = 300,
	smashFire = 500,
	smashGhost = 500,
	underTotem = 300,
	smashTotem = 800,
	letter = 100,
	spelled = 3000,
	orb = 100,
	relic = 500,
	jumpCrawler = 200,
	smashCrawler = 500,
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
	conveyorSpeed = 2.6,
	-- Seconds a crumbling tile shakes after being stepped on, then how long it takes to fall away.
	-- On ice your speed eases toward the controls at this rate instead of snapping.
	iceGrip = 1.6,
	crumbleDelay = 0.6,
	crumbleFall = 0.5,
	-- You only fall once your centre is this far past the lip of a pit.
	pitMargin = 0.2,
	switchReach = 0.6,
	-- Launch speed off a spring pad; clears a 5-wide pit at full run.
	springVelocity = 17,
	springReach = 0.45,
}

-- Pitfall-style vines over 6-wide pits. They swing on their own clock; jump into the end of the
-- rope to catch it and press Jump again to let go with the swing's speed.
Config.VINE = {
	-- Height of the pivot above the walkway, and the rope hanging from it.
	pivot = 4.4,
	length = 2.9,
	-- Widest angle either side of straight down (radians), and seconds for one swing there and back.
	swing = 0.8,
	period = 2.4,
	-- How close your hands must pass to the end of the rope to catch it.
	grabReach = 0.8,
	-- Hands above feet while hanging.
	hang = 1.35,
	-- Upward kick when you let go, on top of the rope's own motion.
	releaseBoost = 9,
	-- Seconds after letting go before you can catch a vine again.
	regrab = 0.4,
}

Config.HAZARDS = {
	-- A jet rumbles for this long before it erupts, then stays up this long.
	jetWarn = 0.6,
	jetBurst = 1.1,
	jetHeight = 2.6,
	-- Drops let go when you come this close along the ring, after a short shake.
	dropTrigger = 2.4,
	dropShake = 0.45,
	dropGravity = -26,
	dropRespawn = 3.5,
	dropRadius = 0.35,
}

-- Ground monsters: every `rearEvery` seconds or so they do their special move for `rearTime`.
Config.CRAWLER = { speed = 2.1, radius = 0.42, rearEvery = 3.2, rearTime = 1.1 }

Config.TOTEM = {
	speed = 1.4,
	radius = 0.6,
	-- Jump apex is ~1.7, so the 2.3-tall body can't be cleared from the ground; you run under a hop.
	hopEvery = 2.2,
	crouchTime = 0.3,
	hopTime = 0.9,
	hopHeight = 2.2,
}

Config.CAMERA = {
	-- Angle from straight down; 60 gives the web build's isometric look.
	polarDeg = 60,
	yawBiasDeg = 14,
	turnDuration = 0.45,
	turnHysteresis = 0.35,
	-- Roblox has no orthographic camera, so a far camera with a narrow field of view stands in for one.
	-- Studs; scales with the world so the framing doesn't change.
	distance = 70 * Config.STUD,
	minHalfHeight = 8.5,
	minHalfWidth = 11,
}

return Config
