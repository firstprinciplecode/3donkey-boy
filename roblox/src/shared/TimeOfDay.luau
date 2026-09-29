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
		tomb = { hex(0x33385a), hex(0x1e2240), hex(0x0e1024) },
		volcano = { hex(0x4a2238), hex(0x2b1326), hex(0x150a14) },
	},
}

function TimeOfDay.forRound(round: number, levelCount: number): string
	local i = round - 1
	local lap = i // levelCount
	return TimeOfDay.TIMES[(i + lap) % #TimeOfDay.TIMES + 1]
end

function TimeOfDay.sky(skinName: string, skin, time: string): { Color3 }
	local byTime = SKIES[time]
	return if byTime then byTime[skinName] or skin.sky else skin.sky
end

return TimeOfDay
