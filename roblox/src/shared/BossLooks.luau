-- One summit monster per level skin, ported from src/entities/bossLooks.ts. Every boss shares the
-- same skeleton (legs, a block body with a toothy face, two swinging arms); a look recolours it and
-- adds its own pieces.
--
-- A part is { group, size, centre, colour, glow, cone }. Groups: "root" (legs, still), "body"
-- (bobs), "armL" / "armR" (swing from the shoulder). Cones stand on `centre` (their base) with
-- size (radius, height, 0), and are built as two stepped blocks. `glow` parts are Neon.

local Config = require(script.Parent.Config)

local C = Config.COLORS

local function box(g: string, s: { number }, p: { number }, c: Color3, glow: boolean?)
	return { g = g, s = Vector3.new(s[1], s[2], s[3]), p = Vector3.new(p[1], p[2], p[3]), c = c, glow = glow == true }
end

local function cone(g: string, radius: number, height: number, p: { number }, c: Color3, glow: boolean?)
	return { g = g, cone = true, s = Vector3.new(radius, height, 0), p = Vector3.new(p[1], p[2], p[3]), c = c, glow = glow == true }
end

local function append(list, more)
	for _, part in more do
		table.insert(list, part)
	end
	return list
end

local function pair(s, p, c, glow: boolean?)
	return { box("body", s, { -p[1], p[2], p[3] }, c, glow), box("body", s, p, c, glow) }
end

local function onArms(s, p, c, glow: boolean?)
	return { box("armL", s, p, c, glow), box("armR", s, p, c, glow) }
end

local function skeleton(k)
	local parts = {
		box("root", { 0.7, 1, 0.8 }, { -0.65, 0.5, 0 }, k.legs or k.fur),
		box("root", { 0.7, 1, 0.8 }, { 0.65, 0.5, 0 }, k.legs or k.fur),
		box("body", { 2.4, 2, 1.8 }, { 0, 1, 0 }, k.fur),
		box("body", { 0.45, 0.45, 0.1 }, { -0.55, 1.45, 0.91 }, k.eye, k.eyeGlow),
		box("body", { 0.45, 0.45, 0.1 }, { 0.55, 1.45, 0.91 }, k.eye, k.eyeGlow),
		box("body", { 1.6, 0.6, 0.1 }, { 0, 0.6, 0.91 }, k.mouth, k.mouthGlow),
	}
	if k.horns then
		table.insert(parts, cone("body", 0.35, 1.1, { -0.7, 2, 0 }, k.horns))
		table.insert(parts, cone("body", 0.35, 1.1, { 0.7, 2, 0 }, k.horns))
	end
	if k.accent then
		table.insert(parts, box("body", { 0.5, 0.3, 0.5 }, { 0, 2.15, 0.3 }, k.accent))
	end
	if k.pupil then
		table.insert(parts, box("body", { 0.16, 0.16, 0.05 }, { -0.5, 1.4, 0.97 }, k.pupil))
		table.insert(parts, box("body", { 0.16, 0.16, 0.05 }, { 0.6, 1.4, 0.97 }, k.pupil))
	end
	for i = 0, 5 do
		local x = -0.6 + i * 0.24
		table.insert(parts, box("body", { 0.14, 0.22, 0.06 }, { x, 0.78, 0.97 }, k.teeth))
		table.insert(parts, box("body", { 0.14, 0.18, 0.06 }, { x + 0.12, 0.42, 0.97 }, k.teeth))
	end
	for _, arm in { "armL", "armR" } do
		table.insert(parts, box(arm, { 0.55, 1.4, 0.7 }, { 0, -0.65, 0 }, k.arms or k.fur))
		table.insert(parts, box(arm, { 0.68, 0.5, 0.8 }, { 0, -1.45, 0 }, k.hands))
	end
	return parts
end

local BossLooks = {}

-- The poster's black spiky monster.
BossLooks.meadow = skeleton({
	fur = C.black,
	hands = C.charcoal,
	horns = C.cream,
	accent = C.pink,
	eye = C.pink,
	pupil = C.black,
	mouth = C.charcoal,
	teeth = C.cream,
})

-- A gummy monster with candy-cane horns, a cherry on top and sprinkles.
do
	local parts = skeleton({
		fur = C.pink,
		hands = C.magenta,
		horns = C.cream,
		eye = C.cream,
		pupil = C.black,
		mouth = C.violet,
		teeth = C.cream,
	})
	append(parts, pair({ 0.62, 0.14, 0.62 }, { 0.7, 2.3, 0 }, C.red))
	append(parts, pair({ 0.36, 0.12, 0.36 }, { 0.7, 2.72, 0 }, C.red))
	table.insert(parts, box("body", { 0.45, 0.45, 0.45 }, { 0, 2.22, 0.2 }, C.red))
	table.insert(parts, box("body", { 0.08, 0.35, 0.08 }, { 0.05, 2.6, 0.2 }, C.leafDark))
	for _, s in {
		{ -0.95, 1.85, C.yellow },
		{ 0.95, 1.8, C.cyan },
		{ -0.95, 0.3, C.cream },
		{ 0.95, 0.35, C.yellow },
		{ -0.15, 1.92, C.cyan },
		{ 0.25, 1.95, C.cream },
	} do
		table.insert(parts, box("body", { 0.2, 0.08, 0.04 }, { s[1], s[2], 0.91 }, s[3]))
	end
	BossLooks.candy = parts
end

-- A sandstone sphinx in a gold and teal headdress.
do
	local parts = skeleton({
		fur = C.sandstone,
		hands = C.sandstoneDark,
		eye = C.teal,
		pupil = C.black,
		mouth = C.brown,
		teeth = C.cream,
	})
	table.insert(parts, box("body", { 2.6, 0.45, 2.0 }, { 0, 2.2, 0 }, C.gold))
	table.insert(parts, box("body", { 2.62, 0.1, 2.02 }, { 0, 2.08, 0 }, C.teal))
	table.insert(parts, box("body", { 2.62, 0.1, 2.02 }, { 0, 2.32, 0 }, C.teal))
	append(parts, pair({ 0.35, 1.3, 0.5 }, { 1.35, 1.3, 0.55 }, C.gold))
	append(parts, pair({ 0.37, 0.1, 0.52 }, { 1.35, 1.05, 0.55 }, C.teal))
	append(parts, pair({ 0.37, 0.1, 0.52 }, { 1.35, 1.5, 0.55 }, C.teal))
	table.insert(parts, box("body", { 0.2, 0.45, 0.15 }, { 0, 2.55, 0.95 }, C.teal))
	BossLooks.desert = parts
end

-- A pumpkin brute: orange ribs, a stem, and a carved face lit from inside.
do
	local parts = skeleton({
		fur = C.orange,
		legs = C.brown,
		arms = C.brown,
		hands = C.leafDark,
		eye = C.yellow,
		eyeGlow = true,
		mouth = C.yellow,
		mouthGlow = true,
		teeth = C.orange,
	})
	for _, x in { -0.95, -0.3, 0.3, 0.95 } do
		table.insert(parts, box("body", { 0.1, 2.0, 0.04 }, { x, 1, 0.905 }, C.maple))
	end
	table.insert(parts, box("body", { 0.3, 0.55, 0.3 }, { 0, 2.27, 0 }, C.leafDark))
	table.insert(parts, box("body", { 0.6, 0.1, 0.35 }, { 0.4, 2.35, 0.1 }, C.leaf))
	BossLooks.autumn = parts
end

-- A snow yeti: white fur, an icy face, ice horns and frosty brows.
do
	local parts = skeleton({
		fur = C.snow,
		hands = C.snowShade,
		horns = C.iceDark,
		eye = C.blue,
		pupil = C.black,
		mouth = C.charcoal,
		teeth = C.snow,
	})
	table.insert(parts, box("body", { 1.95, 1.7, 0.06 }, { 0, 1.05, 0.9 }, C.ice))
	table.insert(parts, box("body", { 0.9, 0.3, 1.0 }, { 0, 2.1, 0 }, C.snowShade))
	append(parts, pair({ 0.55, 0.12, 0.12 }, { 0.55, 1.78, 0.93 }, C.snowShade))
	append(parts, onArms({ 0.75, 0.35, 0.85 }, { 0, -0.05, 0 }, C.snowShade))
	BossLooks.winter = parts
end

-- A bandaged mummy with a gold headband, a scarab and eyes that glow green.
do
	local parts = skeleton({
		fur = C.cream,
		hands = C.creamDark,
		eye = C.lime,
		eyeGlow = true,
		mouth = C.charcoal,
		teeth = C.creamDark,
	})
	for _, y in { 0.25, 1.05 } do
		table.insert(parts, box("body", { 2.44, 0.12, 1.84 }, { 0, y, 0 }, C.creamDark))
	end
	table.insert(parts, box("body", { 2.46, 0.2, 1.86 }, { 0, 1.9, 0 }, C.gold))
	table.insert(parts, box("body", { 0.3, 0.3, 0.1 }, { 0, 1.9, 0.93 }, C.teal))
	append(parts, onArms({ 0.57, 0.1, 0.72 }, { 0, -0.4, 0 }, C.creamDark))
	append(parts, onArms({ 0.57, 0.1, 0.72 }, { 0, -1.0, 0 }, C.creamDark))
	BossLooks.tomb = parts
end

-- A lava golem: dark basalt split by glowing cracks, under a crown of flame.
do
	local parts = skeleton({
		fur = C.basalt,
		hands = C.basaltDark,
		horns = C.basaltDark,
		eye = C.yellow,
		eyeGlow = true,
		mouth = C.lava,
		mouthGlow = true,
		teeth = C.basaltDark,
	})
	append(parts, pair({ 0.16, 0.2, 0.16 }, { 0.7, 3.05, 0 }, C.yellow, true))
	table.insert(parts, box("body", { 0.1, 0.55, 0.04 }, { -1.0, 0.95, 0.905 }, C.lava, true))
	table.insert(parts, box("body", { 0.35, 0.1, 0.04 }, { -0.87, 1.2, 0.905 }, C.lava, true))
	table.insert(parts, box("body", { 0.1, 0.5, 0.04 }, { 0.98, 1.75, 0.905 }, C.lava, true))
	table.insert(parts, box("body", { 0.3, 0.1, 0.04 }, { 0.85, 1.52, 0.905 }, C.lava, true))
	append(parts, onArms({ 0.57, 0.1, 0.72 }, { 0, -0.9, 0 }, C.lava, true))
	table.insert(parts, cone("body", 0.22, 0.7, { -0.35, 2, 0.3 }, C.orange, true))
	table.insert(parts, cone("body", 0.26, 0.95, { 0, 2, 0.35 }, C.lava, true))
	table.insert(parts, cone("body", 0.22, 0.7, { 0.35, 2, 0.3 }, C.orange, true))
	BossLooks.volcano = parts
end

return BossLooks
