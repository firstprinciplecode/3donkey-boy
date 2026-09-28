-- Builds the static pyramid for a level out of anchored Parts, ported from src/world.ts and
-- src/terraceExtras.ts. Random choices (windows, props, fences, spikes) use the web build's seeded
-- random in the same order, so the layout matches.

local Config = require(script.Parent.Config)
local Decor = require(script.Parent.Decor)
local Level = require(script.Parent.Level)
local Rand = require(script.Parent.Rand)
local Skins = require(script.Parent.Skins)
local VoxelBuilder = require(script.Parent.VoxelBuilder)

local C = Config.COLORS
local Frame = VoxelBuilder.Frame
local PIT_DEPTH = Level.PIT_DEPTH
local BASE_BOTTOM = -Level.BASE_DEPTH
local BOSS_POS = Config.BOSS_POS

type Rand = () -> number

local World = {}

local function folder(parent: Instance, name: string): Folder
	local f = Instance.new("Folder")
	f.Name = name
	f.Parent = parent
	return f
end

local function inGap(gaps, ring: number, x: number, z: number): boolean
	local side, offset = Level.squareCoords(x, z)
	for _, g in gaps do
		if g.ring == ring and g.side == side and math.abs(offset - g.offset) < g.width / 2 - 0.01 then
			return true
		end
	end
	return false
end

-- One or two tier walls per level get the poster's striped neon treatment. Keyed "tier:side".
local NEON_PALETTES = {
	{ C.neon, C.pink, C.magenta, C.violet },
	{ C.yellow, C.orange, C.maple, C.pink },
}

local function neonPanels(level, rand: Rand)
	local panels = {}
	local count = if level.ringCount > 4 then 2 else 1
	for i = 0, count - 1 do
		local tier = 1 + math.floor(rand() * (level.ringCount - 1))
		local side = math.floor(rand() * 4)
		panels[`{tier}:{side}`] = NEON_PALETTES[i % #NEON_PALETTES + 1]
	end
	return panels
end

-- One tier: a terrace ring of cells on top, plus the outer wall down to (one below) the terrace
-- underneath. Gap spans are cut out of the top layer and floored with spikes one cell down.
local function buildTier(vb, level, skin, k: number, gaps, rand: Rand, neon)
	local half = level:tierHalf(k)
	local inner = if k < level.summitTier then level:tierHalf(k + 1) else 0
	local top = level:tierTop(k)
	local wallBottom = if k == 0 then BASE_BOTTOM else level:tierTop(k - 1) - PIT_DEPTH
	local style = skin.tiers[k % #skin.tiers + 1]
	local tops = style.top
	local multi = #tops > 2

	for ix = -half, half - 1 do
		for iz = -half, half - 1 do
			local cx, cz = ix + 0.5, iz + 0.5
			local cheb = math.max(math.abs(cx), math.abs(cz))
			if cheb >= inner then
				if k < level.summitTier and inGap(gaps, k, cx, cz) then
					if cheb < half - 1 then
						vb:box(cx, top - PIT_DEPTH - 0.5, cz, 1, 1, 1, C.charcoal)
					end
					vb:cone(cx, top - PIT_DEPTH, cz, 0.2, 0.6, if (ix + iz) % 2 ~= 0 then C.cream else C.creamDark)
				else
					local topColor = if multi then tops[(ix + iz) % #tops + 1] else tops[(ix + iz) % 2 + 1]
					vb:box(cx, top - 0.5, cz, 1, 1, 1, topColor)
				end

				-- The ground tier's wall is plain bands, built as whole rings below.
				if cheb >= half - 1 and k > 0 then
					local side = Level.squareCoords(cx, cz)
					local palette = neon[`{k}:{side}`]
					local layers = math.round(top - wallBottom) - 1
					local layer = 0
					local y = top - 1
					while y > wallBottom do
						if palette then
							local i = math.min(#palette - 1, math.floor((layer / layers) * #palette))
							vb:box(cx, y - 0.5, cz, 1, 1, 1, palette[i + 1])
						elseif rand() < 0.07 then
							vb:glow(cx, y - 0.5, cz, 1, 1, 1, skin.windowColor)
						else
							vb:box(cx, y - 0.5, cz, 1, 1, 1, style.side[(ix + iz + layer) % 2 + 1])
						end
						y -= 1
						layer += 1
					end
				end
			end
		end
	end

	if k == 0 then
		-- Same colours as the web build's per-cell loop, merged into one ring of four slabs per layer.
		local layer = 0
		local y = top - 1
		while y > wallBottom do
			local color = skin.baseBands[layer % #skin.baseBands + 1]
			local cy = y - 0.5
			vb:box(0, cy, half - 0.5, half * 2, 1, 1, color)
			vb:box(0, cy, -half + 0.5, half * 2, 1, 1, color)
			vb:box(half - 0.5, cy, 0, 1, 1, half * 2 - 2, color)
			vb:box(-half + 0.5, cy, 0, 1, 1, half * 2 - 2, color)
			y -= 1
			layer += 1
		end
	end
end

local function buildLadder(vb, level, l)
	local upper = l.ring + 1
	local f = Frame.new(l.side, level:tierHalf(upper) + 0.08, l.offset)
	local y0 = level:tierTop(l.ring)
	local y1 = level:tierTop(upper)
	local len = y1 - y0
	f:box(vb, -0.32, y0 + len / 2, 0, 0.1, len, 0.1, C.yellow)
	f:box(vb, 0.32, y0 + len / 2, 0, 0.1, len, 0.1, C.yellow)
	local y = y0 + 0.35
	while y < y1 - 0.2 do
		f:box(vb, 0, y, 0, 0.6, 0.08, 0.08, C.cream)
		y += 0.42
	end
end

-- Striped lip where barrels tumble off to the ring below.
local function buildChute(vb, level, c)
	local f = Frame.new(c.side, level:tierHalf(c.ring), c.offset)
	local y = level:tierTop(c.ring)
	f:block(vb, 0, y, -1.2, 1.2, 0.06, 0.9, C.yellow)
	f:block(vb, 0, y, -0.4, 1.2, 0.06, 0.6, C.pink)
	f:block(vb, 0, y - 0.35, 0.3, 1.2, 0.3, 0.6, C.yellow)
	f:block(vb, 0, y - 0.95, 0.75, 1.2, 0.3, 0.5, C.pink)
end

-- Props line the inside of each terrace, against the wall of the tier above (never in front of the player).
local function buildDecor(vb, level, skin, gaps, rand: Rand)
	local def = level.def
	local keepClear = {}
	for _, l in def.ladders do
		table.insert(keepClear, { ring = l.ring, side = l.side, offset = l.offset, pad = 1.7 })
	end
	table.insert(keepClear, { ring = def.drum.ring, side = def.drum.side, offset = def.drum.offset, pad = 2 })
	for _, lock in def.locks do
		if lock.kind == "switch" then
			local s = lock.switchAt
			table.insert(keepClear, { ring = s.ring, side = s.side, offset = s.offset, pad = 1.4 })
		end
	end
	for _, list in { gaps, def.conveyors } do
		for _, g in list do
			table.insert(keepClear, { ring = g.ring, side = g.side, offset = g.offset, pad = g.width / 2 + 0.8 })
		end
	end

	for k = 0, level.ringCount - 1 do
		local inner = level:tierHalf(k + 1)
		local y = level:tierTop(k)
		for side = 0, 3 do
			local offset = -inner + 1.2 + rand()
			while offset < inner - 1.2 do
				local blocked = false
				for _, c in keepClear do
					if c.ring == k and c.side == side and math.abs(c.offset - offset) < c.pad then
						blocked = true
						break
					end
				end
				if not blocked then
					local kind = Decor.pick(skin.decor, rand)
					if kind == "cart" then
						if offset + 1.8 < inner - 1.2 then
							Decor.build.cart(vb, Frame.new(side, inner + 0.55, offset + 0.6), y, rand)
							offset += 1.4
						end
					else
						Decor.build[kind](vb, Frame.new(side, inner + 0.55, offset), y, rand)
					end
				end
				offset += 1.8 + rand() * 1.6
			end
		end
	end
end

local LANTERN_SPACING = 5

-- Wall lanterns along the back of each terrace; they only light up at dusk and night.
local function buildLanterns(vb, level)
	local def = level.def
	local lanternY = math.min(2.3, def.tierHeight - 0.5)
	for k = 0, level.ringCount - 1 do
		local inner = level:tierHalf(k + 1)
		local y = level:tierTop(k) + lanternY
		for side = 0, 3 do
			local offset = -inner + 2.5
			while offset <= inner - 2.5 do
				local nearLadder = false
				for _, l in def.ladders do
					if l.ring == k and l.side == side and math.abs(l.offset - offset) < 1.2 then
						nearLadder = true
						break
					end
				end
				if not nearLadder then
					local f = Frame.new(side, inner, offset)
					f:box(vb, 0, y, 0.18, 0.08, 0.08, 0.36, C.charcoal)
					f:box(vb, 0, y - 0.02, 0.36, 0.34, 0.06, 0.34, C.charcoal)
					f:glow(vb, 0, y - 0.2, 0.36, 0.26, 0.3, 0.26, C.yellow)
				end
				offset += LANTERN_SPACING
			end
		end
	end
end

-- Thin glowing ribs over each neon panel, stopping short of ladders and barrel chutes.
local function buildNeonRibs(vb, level, panels)
	local def = level.def
	for key, palette in panels do
		local tier, side = string.match(key, "(%d+):(%d+)")
		tier, side = tonumber(tier) :: number, tonumber(side) :: number
		local half = level:tierHalf(tier)
		local top = level:tierTop(tier)
		local floor = level:tierTop(tier - 1)
		local rib = if palette[1] == C.neon then Config.hex(0xffb3ec) else C.cream
		for offset = -half + 1, half - 1 do
			local skip = false
			for _, l in def.ladders do
				if l.ring == tier - 1 and l.side == side and math.abs(l.offset - offset) < 0.9 then
					skip = true
				end
			end
			for _, c in def.chutes do
				if c.ring == tier and c.side == side and math.abs(c.offset - offset) < 1.1 then
					skip = true
				end
			end
			if not skip then
				local f = Frame.new(side, half, offset)
				f:glow(vb, 0, (top - 0.15 + floor) / 2, 0.05, 0.12, top - 0.15 - floor, 0.1, rib)
			end
		end
	end
end

-- Where streams pour off the ground ring: one per side, clear of the drum and ring-0 gaps and belts.
local function cascadeSpots(level)
	local def = level.def
	local half = level:tierHalf(0)
	local busy = { { side = def.drum.side, offset = def.drum.offset, pad = 3 } }
	for _, list in { def.pits, def.crumbles, def.platforms, def.conveyors } do
		for _, g in list do
			if g.ring == 0 then
				table.insert(busy, { side = g.side, offset = g.offset, pad = g.width / 2 + 1.8 })
			end
		end
	end
	local tries = { 0.35, -0.4, 0.1, -0.15, 0.6, -0.6 }
	local spots = {}
	for side = 0, 3 do
		local kind = if side % 2 == 0 then "rainbow" else "water"
		local width = if kind == "rainbow" then 2.1 else 1.6
		for i = 0, #tries - 1 do
			local offset = math.round(tries[(i + side) % #tries + 1] * half * 2) / 2
			local free = math.abs(offset) <= half - 2.5
			for _, b in busy do
				if free and b.side == side and math.abs(b.offset - offset) < b.pad + width / 2 then
					free = false
				end
			end
			if free then
				table.insert(spots, { side = side, offset = offset, kind = kind, width = width })
				break
			end
		end
	end
	return spots
end

-- White picket fences on stretches of terrace edge. They skip gaps, chutes, ladder tops, the drum
-- and the cascade lips, and stay low so they never hide the player.
local function buildFences(vb, level, gaps, cascades, rand: Rand)
	local def = level.def
	local function blocked(ring: number, side: number, offset: number): boolean
		for _, g in gaps do
			if g.ring == ring and g.side == side and math.abs(g.offset - offset) < g.width / 2 + 0.3 then
				return true
			end
		end
		for _, c in def.chutes do
			if c.ring == ring and c.side == side and math.abs(c.offset - offset) < 1.3 then
				return true
			end
		end
		for _, l in def.ladders do
			if l.ring == ring - 1 and l.side == side and math.abs(l.offset - offset) < 1 then
				return true
			end
		end
		if ring == def.drum.ring and side == def.drum.side and math.abs(def.drum.offset - offset) < 1.6 then
			return true
		end
		if ring == 0 then
			for _, c in cascades do
				if c.side == side and math.abs(c.offset - offset) < c.width / 2 + 0.3 then
					return true
				end
			end
		end
		return false
	end

	-- Rails are merged into one pair per unbroken run of pickets.
	local function rails(side: number, half: number, y: number, first: number?, last: number?)
		if first and last and last > first then
			local mid = Frame.new(side, half, (first + last) / 2)
			mid:box(vb, 0, y + 0.14, -0.14, last - first, 0.05, 0.03, C.creamDark)
			mid:box(vb, 0, y + 0.32, -0.14, last - first, 0.05, 0.03, C.creamDark)
		end
	end

	for k = 0, level.ringCount - 1 do
		local half = level:tierHalf(k)
		local y = level:tierTop(k)
		for side = 0, 3 do
			if rand() >= 0.45 then
				local len = 3 + rand() * 5
				local start = -half + 1.2 + rand() * math.max(0, half * 2 - 2.4 - len)
				local first, prev = nil, nil
				local offset = start
				while offset <= start + len do
					if blocked(k, side, offset) then
						rails(side, half, y, first, prev)
						first, prev = nil, nil
					else
						local f = Frame.new(side, half, offset)
						f:block(vb, 0, y, -0.14, 0.08, 0.42, 0.06, C.cream)
						first = first or offset
						prev = offset
					end
					offset += 0.3
				end
				rails(side, half, y, first, prev)
			end
		end
	end
end

-- Spiked corner posts and a rainbow banner behind the boss.
local function buildSummit(vb, level)
	local y = level:tierTop(level.summitTier)
	local c = level.def.summitHalf - 0.4
	for _, p in { { c, c }, { c, -c }, { -c, c }, { -c, -c } } do
		vb:block(p[1], y, p[2], 0.5, 0.9, 0.5, C.cream)
		vb:cone(p[1], y + 0.9, p[2], 0.25, 0.8, C.creamDark)
	end
	for i, color in Config.RAINBOW do
		vb:block(BOSS_POS.x - 1.6, y, -1.05 + (i - 1) * 0.35, 0.3, 3, 0.35, color)
	end
	vb:block(BOSS_POS.x - 1.6, y + 3, 0, 0.4, 0.3, 2.6, C.cream)
end

-- Pink drum at the edge of the ground ring; barrels disappear into it (and light fires).
local function buildDrum(vb, level)
	local drum = level.def.drum
	local f = Frame.new(drum.side, level:ringRadius(drum.ring) + 0.95, drum.offset)
	local y = level:tierTop(drum.ring)
	f:block(vb, 0, y, 0, 1.0, 1.2, 1.0, C.pink)
	f:box(vb, 0, y + 0.3, 0, 1.04, 0.1, 1.04, C.black)
	f:box(vb, 0, y + 0.9, 0, 1.04, 0.1, 1.04, C.black)
	f:block(vb, -0.2, y + 1.2, 0.1, 0.28, 0.4, 0.28, C.orange)
	f:block(vb, 0.18, y + 1.2, -0.12, 0.22, 0.6, 0.22, C.yellow)
	f:block(vb, 0.04, y + 1.2, 0.25, 0.18, 0.28, 0.18, C.red)
end

-- Ammo stacked beside the boss: three upright barrels.
local function buildBarrelPile(vb, x: number, y: number, z: number)
	local R = Config.BARREL.radius
	local LENGTH = 0.8
	for i, spot in { { -0.45, LENGTH / 2 }, { 0.45, LENGTH / 2 }, { 0, LENGTH * 1.5 } } do
		local cx, cy = x + spot[1], y + spot[2]
		local barrel = vb:box(cx, cy, z, LENGTH, R * 2, R * 2, Config.RAINBOW[i * 2 - 1])
		barrel.Shape = Enum.PartType.Cylinder
		barrel.CFrame *= CFrame.Angles(0, 0, math.pi / 2)
		for _, dy in { -LENGTH / 2 + 0.05, LENGTH / 2 - 0.05 } do
			local rim = vb:box(cx, cy + dy, z, 0.1, R * 2 + 0.04, R * 2 + 0.04, C.black)
			rim.Shape = Enum.PartType.Cylinder
			rim.CFrame *= CFrame.Angles(0, 0, math.pi / 2)
		end
	end
end

-- Streams pouring off the ground ring and down the floating base. The web build scrolls a texture;
-- here the stripes are still.
local TAIL = 7
local LIP = 0.9

local function buildCascades(vb, level, spots)
	local top = level:tierTop(0)
	local half = level:tierHalf(0)
	local wallH = top - BASE_BOTTOM
	for _, spot in spots do
		local colors = if spot.kind == "rainbow" then Config.RAINBOW else { C.water, C.cyan, C.water, C.white, C.water }
		local stripe = spot.width / #colors
		local f = Frame.new(spot.side, half, spot.offset)
		for i, color in colors do
			local u = -spot.width / 2 + (i - 0.5) * stripe
			f:box(vb, u, BASE_BOTTOM + wallH / 2, 0.04, stripe, wallH, 0.04, color)
			f:box(vb, u, top + 0.02, -LIP / 2, stripe, 0.04, LIP, color)
			for step = 0, 2 do
				local h = TAIL / 3
				local part = f:box(vb, u, BASE_BOTTOM - (step + 0.5) * h, 0.04, stripe, h, 0.04, color)
				part.Transparency = 0.25 + step * 0.25
				part.CastShadow = false
			end
		end
		local foam = f:box(vb, 0, top - 0.25, 0.07, spot.width + 0.4, 0.5, 0.04, C.white)
		foam.Transparency = 0.4
	end
end

-- Black sawtooth spikes hanging under the rim of the floating base, like the poster's island.
-- Only the outer two rings are drawn (the rest is out of sight underneath), but every cell still
-- draws its random number so the sequence stays in step with the web build.
local function buildBaseSpikes(vb, level, rand: Rand)
	local half = level:tierHalf(0)
	for ix = -half, half - 1 do
		for iz = -half, half - 1 do
			local cx, cz = ix + 0.5, iz + 0.5
			local cheb = math.max(math.abs(cx), math.abs(cz))
			if cheb >= half - 3 then
				local depth = half - cheb
				local h = 0.6 + rand() * 1.2 + depth * 0.5
				if cheb >= half - 2 then
					vb:spike(cx, BASE_BOTTOM, cz, 1.35, h, if (ix + iz) % 2 ~= 0 then C.black else C.charcoal)
				end
			end
		end
	end
end

function World.build(level, parent: Instance): Model
	local def = level.def
	local skin = Skins[def.skin]
	local rand = Rand.seeded(Rand.hashString(def.name))
	local model = Instance.new("Model")
	model.Name = "Popscotch"

	local gaps = {}
	for _, list in { def.pits, def.crumbles, def.platforms } do
		for _, g in list do
			table.insert(gaps, g)
		end
	end

	local vb = VoxelBuilder.new(folder(model, "Tiers"))
	local neon = neonPanels(level, rand)
	for k = 0, level.summitTier do
		buildTier(vb, level, skin, k, gaps, rand, neon)
	end

	vb:into(folder(model, "Ladders"))
	for _, ladder in def.ladders do
		buildLadder(vb, level, ladder)
	end

	vb:into(folder(model, "Props"))
	for _, chute in def.chutes do
		buildChute(vb, level, chute)
	end
	buildDecor(vb, level, skin, gaps, rand)
	buildLanterns(vb, level)
	buildNeonRibs(vb, level, neon)
	local cascades = cascadeSpots(level)
	buildFences(vb, level, gaps, cascades, rand)
	buildSummit(vb, level)
	buildDrum(vb, level)
	buildBarrelPile(vb, BOSS_POS.x - 0.4, level:tierTop(level.summitTier), 2.1)

	vb:into(folder(model, "Base")):castShadows(false)
	buildBaseSpikes(vb, level, rand)
	buildCascades(vb, level, cascades)

	vb:into(model)
	local goal = vb:box(0, level:tierTop(level.summitTier) + 1.1, 0, 0.2, 1.3, 1.3, skin.goal)
	goal.Name = "Goal"
	goal.Shape = Enum.PartType.Cylinder
	goal.Material = Enum.Material.Neon

	model:SetAttribute("PartCount", vb.count)
	model.Parent = parent
	return model
end

return World
