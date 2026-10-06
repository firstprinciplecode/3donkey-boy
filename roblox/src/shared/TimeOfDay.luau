-- Day, dusk and night, ported from src/timeOfDay.ts and the sky colours in src/style.css. Each round
-- moves on a time of day, so the sky goes from light to darker and back; each lap through the levels
-- shifts it by one, so a level comes round at a different time on every lap.

local Config = require(script.Parent.Config)

local hex = Config.hex

local TimeOfDay = {}

TimeOfDay.TIMES = { "day", "dusk", "night" }

-- Roblox Lighting per time. The sun stays up at every time (the moon's light at a real night
-- ClockTime is too dark to play by), so dusk and night come from dimmer, tinted light instead.
-- `glow` lights windows, lanterns and balloons (Neon); `stars` is how strongly stars show.
TimeOfDay.LIGHTING = {
	day = {
		ClockTime = 13.5,
		Brightness = 2.2,
		Ambient = Color3.fromRGB(96, 104, 92),
		OutdoorAmbient = Color3.fromRGB(170, 190, 160),
		ColorShift_Top = Color3.new(0, 0, 0),
		glow = false,
		stars = 0,
	},
	dusk = {
		ClockTime = 16.8,
		Brightness = 1.6,
		Ambient = Color3.fromRGB(100, 80, 110),
		OutdoorAmbient = Color3.fromRGB(170, 130, 150),
		ColorShift_Top = hex(0xff9d5c),
		glow = true,
		stars = 0.35,
	},
	night = {
		ClockTime = 14.5,
		Brightness = 0.8,
		Ambient = Color3.fromRGB(44, 40, 72),
		OutdoorAmbient = Color3.fromRGB(80, 90, 140),
		ColorShift_Top = hex(0x5a6aa8),
		glow = true,
		stars = 1,
	},
	-- Bright pastel daylight. Candy Hills stays here so the pink floors do not fall into dusk.
	fair = {
		ClockTime = 13.2,
		Brightness = 2.6,
		Ambient = Color3.fromRGB(150, 120, 140),
		OutdoorAmbient = Color3.fromRGB(230, 196, 210),
		ColorShift_Top = hex(0xfff0f4),
		glow = false,
		stars = 0,
	},
	-- Near-black. The tomb's wall lamps are the light that remains.
	crypt = {
		ClockTime = 0.2,
		Brightness = 0.05,
		Ambient = Color3.fromRGB(8, 6, 14),
		OutdoorAmbient = Color3.fromRGB(14, 12, 24),
		ColorShift_Top = Color3.new(0, 0, 0),
		glow = true,
		stars = 1,
	},
	-- High, hard sun for the desert: noon, warm, and brighter than a normal day.
	bake = {
		ClockTime = 12.2,
		Brightness = 3,
		Ambient = Color3.fromRGB(150, 126, 92),
		OutdoorAmbient = Color3.fromRGB(230, 196, 140),
		ColorShift_Top = hex(0xffe4a8),
		glow = false,
		stars = 0,
	},
}

-- The page gradient (centre, middle, edge) for dusk and night; daytime is each skin's own `sky`.
local SKIES = {
	dusk = {
		meadow = { hex(0xffd9b0), hex(0xe7a2a2), hex(0x8d6fa8) },
		candy = { hex(0xffd3e4), hex(0xd99ac8), hex(0x7d68b0) },
		desert = { hex(0xffcf8a), hex(0xf08a6a), hex(0x8a4f7a) },
		autumn = { hex(0xffc98a), hex(0xe57e5a), hex(0x7a4a6a) },
		winter = { hex(0xffd9d0), hex(0xc9a4c8), hex(0x6a6fa8) },
		tomb = { hex(0xffd79a), hex(0xe59a62), hex(0x6f5a7a) },
		volcano = { hex(0xffb27a), hex(0xd9584a), hex(0x5a2a4a) },
	},
	night = {
		meadow = { hex(0x34466e), hex(0x1d2745), hex(0x0f152b) },
		candy = { hex(0x45315f), hex(0x2a1d46), hex(0x170f2b) },
		desert = { hex(0x42305a), hex(0x251a3c), hex(0x120d22) },
		autumn = { hex(0x3f2f4f), hex(0x261c33), hex(0x140e1d) },
		winter = { hex(0x2f4a78), hex(0x1a2a4d), hex(0x0c142b) },
		tomb = { hex(0x1a1830), hex(0x100e1c), hex(0x07060e) },
		volcano = { hex(0x4a2238), hex(0x2b1326), hex(0x150a14) },
	},
}

function TimeOfDay.forRound(round: number, levelCount: number): string
	local i = round - 1
	local lap = i // levelCount
	return TimeOfDay.TIMES[(i + lap) % #TimeOfDay.TIMES + 1]
end

-- The desert and Candy Hills stay in daylight. The tomb stays night. The rest move with the round.
function TimeOfDay.forLevel(round: number, levelCount: number, skin: string): string
	if skin == "desert" or skin == "candy" then
		return "day"
	end
	if skin == "tomb" then
		return "night"
	end
	return TimeOfDay.forRound(round, levelCount)
end

function TimeOfDay.lighting(time: string, skin: string)
	if skin == "desert" then
		return TimeOfDay.LIGHTING.bake
	end
	if skin == "candy" then
		return TimeOfDay.LIGHTING.fair
	end
	if skin == "tomb" then
		return TimeOfDay.LIGHTING.crypt
	end
	return TimeOfDay.LIGHTING[time]
end

function TimeOfDay.sky(skinName: string, skin, time: string): { Color3 }
	local byTime = SKIES[time]
	return if byTime then byTime[skinName] or skin.sky else skin.sky
end

return TimeOfDay
