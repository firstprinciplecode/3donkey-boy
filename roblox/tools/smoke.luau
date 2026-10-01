-- Minimal fake of the Roblox API: enough to run the world and backdrop builders and count parts.
local args = { ... }
local sources = {}
for i = 1, #args, 2 do sources[args[i]] = args[i + 1] end

local function vec(x, y, z)
	return setmetatable({ X = x, Y = y, Z = z }, Vec)
end
Vec = {}
Vec.__index = function(v, k)
	if k == "Unit" then local m = math.sqrt(v.X^2 + v.Y^2 + v.Z^2); return vec(v.X/m, v.Y/m, v.Z/m) end
	if k == "Magnitude" then return math.sqrt(v.X^2 + v.Y^2 + v.Z^2) end
end
Vec.__add = function(a, b) return vec(a.X + b.X, a.Y + b.Y, a.Z + b.Z) end
Vec.__sub = function(a, b) return vec(a.X - b.X, a.Y - b.Y, a.Z - b.Z) end
Vec.__mul = function(a, b)
	if type(a) == "number" then a, b = b, a end
	if type(b) == "number" then return vec(a.X * b, a.Y * b, a.Z * b) end
	return vec(a.X * b.X, a.Y * b.Y, a.Z * b.Z)
end
Vec.__div = function(a, b) return vec(a.X / b, a.Y / b, a.Z / b) end
Vector3 = { new = vec, zero = vec(0,0,0), one = vec(1,1,1), yAxis = vec(0,1,0), xAxis = vec(1,0,0), zAxis = vec(0,0,1) }
Vector2 = { new = function(x, y) return { X = x, Y = y } end }
local CF = {}
CF.__mul = function(a, b) return setmetatable({}, CF) end
CF.__add = function(a, b) return setmetatable({}, CF) end
CF.__index = function(t, k)
	if k == "Position" then return vec(0,0,0) end
	if k == "Rotation" then return setmetatable({}, CF) end
end
CFrame = { new = function() return setmetatable({}, CF) end, Angles = function() return setmetatable({}, CF) end,
	lookAt = function() return setmetatable({}, CF) end }
CFrame.identity = CFrame.new()
Color3 = { fromRGB = function(r, g, b) return { r = r, g = g, b = b } end, new = function(r, g, b) return { r = r, g = g, b = b } end }
local function enumProxy() return setmetatable({}, { __index = function(t, k) local p = enumProxy(); rawset(t, k, p); return p end }) end
Enum = enumProxy()
UDim2 = { fromScale = function() return {} end, fromOffset = function() return {} end, new = function() return {} end }
ColorSequence = { new = function() return {} end }
ColorSequenceKeypoint = { new = function() return {} end }
NumberSequence = { new = function() return {} end }
NumberSequenceKeypoint = { new = function() return {} end }

counts = {}
local Obj = {}
Obj.__index = Obj
function Obj:SetAttribute(k, v) self._attrs[k] = v end
function Obj:GetAttribute(k) return self._attrs[k] end
function Obj:FindFirstChild() return nil end
function Obj:FindFirstChildOfClass() return nil end
function Obj:Destroy() end
function Obj:ClearAllChildren() end
UDim = { new = function() return {} end }
Instance = { new = function(class)
	counts[class] = (counts[class] or 0) + 1
	return setmetatable({ ClassName = class, _attrs = {} }, Obj)
end }
workspace = setmetatable({ _attrs = {} }, Obj)
function workspace:BulkMoveTo() end

-- Module loader: script.Parent.X resolves to a marker that require() loads.
local loaded = {}
local markers = {}
local function markerFor(dir)
	return setmetatable({}, { __index = function(_, name) return { __module = dir .. "/" .. name } end })
end
function require(m)
	local path = m.__module
	if loaded[path] then return loaded[path] end
	local src = assert(sources[path], "no source for " .. path)
	local fn = assert(loadstring(src, path))
	local dir = string.match(path, "^(.*)/[^/]+$")
	local env = setmetatable({ script = { Parent = markerFor(dir) }, require = require, game = game, workspace = workspace }, { __index = getfenv(1) })
	setfenv(fn, env)
	loaded[path] = fn()
	return loaded[path]
end
local rs = { Shared = markerFor("shared"), WaitForChild = function(self, n) return markerFor("shared") end }
game = { GetService = function(_, name) return rs end }

local Level = require({ __module = "shared/Level" })
local Levels = require({ __module = "shared/Levels" })
local Skins = require({ __module = "shared/Skins" })
local World = require({ __module = "shared/World" })
local level = Level.new(Levels[1])
local model = World.build(level, workspace)
print("world parts:", model:GetAttribute("PartCount"))
local Backdrop = require({ __module = "client/Backdrop" })
local before = counts.Part
local bd = Backdrop.new(level, Skins.meadow, workspace)
print("backdrop parts:", counts.Part - before)
bd:update(1/60, 0.24, vec(0, 0, 0))
local candy = Level.new(Levels[2])
before = counts.Part
World.build(candy, workspace)
Backdrop.new(candy, Skins.candy, workspace)
print("candy world + backdrop parts:", counts.Part - before)

local Items = require({ __module = "client/Items" })
before = counts.Part
local items = Items.new(level, workspace)
items:spawn()
items:update(1/60)
print("item parts:", counts.Part - before, "items:", #items.list)
for _, spot in require({ __module = "shared/Orbs" }).spots(level) do
	print(`orb ring={spot.ring} side={spot.side} offset={spot.offset}`)
end
items:take(items.list[10])
local held = items:lettersHeld()
assert(held[1] and not held[2] and not held[3], "letter-1 should count as held")
local Obstacles = require({ __module = "client/Obstacles" })
local Totem = require({ __module = "client/Totem" })
local Player = require({ __module = "client/Player" })
local obstacles = Obstacles.new(level, workspace)
local conveyor = level.def.conveyors[1]
assert(obstacles:carry(conveyor.ring, level:spotS(conveyor)) == conveyor.dir * 2.6, "conveyor should carry")
assert(obstacles:carry(0, level:spotS(level.def.pits[1])) == nil, "pit should be a gap")
local gated = level.def.locks[1]
assert(not obstacles:isLadderOpen(gated.ladder), "gate starts closed")
local switchS = level:spotS(gated.switchAt)
local events = obstacles:update(1 / 120, { ring = gated.switchAt.ring, s = switchS, grounded = true })
assert(events.switched and obstacles:isLadderOpen(gated.ladder), "standing on the switch opens the gate")
for _ = 1, 120 do
	obstacles:update(1 / 120, { ring = 0, s = 0, grounded = true })
	obstacles:render(1 / 120)
end
obstacles:reset(true)
assert(not obstacles:isLadderOpen(gated.ladder), "a fresh round relocks the gate")

local totem = Totem.new(level, level.def.totems[1], 1.4, workspace)
local hopped = false
for _ = 1, 120 * 6 do
	totem:update(1 / 120, obstacles)
	hopped = hopped or totem:isAirborne()
end
totem:render()
assert(hopped, "totem should hop within six seconds")
for skin, look in Skins do
	assert(require({ __module = "shared/TotemLooks" })[look.totem], `{skin} has no totem look "{look.totem}"`)
	local themed = Totem.new(level, level.def.totems[1], 1.4, workspace, look.totem)
	themed:update(1 / 60, obstacles)
	themed:render()
	themed:destroy()
end
for i, def in Levels do
	assert(def.totems and #def.totems > 0, `level {i} has no totem`)
end

-- A hedgehog paces its stretch, curling into a ball now and then.
local Crawler = require({ __module = "client/Crawler" })
local hog = Crawler.new(level, { ring = 1, from = { 0, -6 }, to = { 0, 6 } }, "hedgehog", 2.1, workspace)
local curled, turned, dir0 = false, false, hog.dir
for _ = 1, 120 * 8 do
	hog:update(1 / 120, obstacles)
	hog:render()
	curled = curled or hog.special > 0
	turned = turned or hog.dir ~= dir0
	assert(hog.progress >= 0 and hog.progress <= hog.length, "the hedgehog stays on its stretch")
end
assert(curled and turned, "the hedgehog should curl and turn back within eight seconds")
assert(#hog.parts == 23, `hedgehog parts: {#hog.parts}`)
hog:destroy()

-- An acorn grows in, shakes loose when you walk under it, falls, shatters and grows back.
local Hazards = require({ __module = "client/Hazards" })
local acornDef = table.clone(level.def)
acornDef.drops = { { ring = 0, side = 0, offset = 2 } }
local acornLevel = Level.new(acornDef)
local hazards = Hazards.new(acornLevel, "acorn", workspace)
local under = { ring = 0, s = acornLevel:sOf(0, 0, 2) }
local cracked, fell, shattered = false, false, nil
for step = 1, 120 * 3 do
	local ev = hazards:update(1 / 120, under)
	hazards:render()
	if ev.cracked then
		assert(step >= 60, "a drop can't trigger while it's still growing")
		cracked = true
	end
	fell = fell or #hazards.dangers > 0
	shattered = shattered or ev.shattered[1]
end
assert(cracked and fell and shattered, "the acorn should crack, fall and shatter")
assert(math.abs(shattered.at.Y - (acornLevel:tierTop(0) + 0.35 / 2)) < 0.5, "it shatters on the walkway")
assert(hazards.drops[1].state == "gone", "the acorn is gone after it shatters")
for _ = 1, 120 * 4 do
	hazards:update(1 / 120, { ring = 3, s = 0 })
end
assert(hazards.drops[1].state == "hang", "the acorn grows back")
hazards:destroy()

-- Standing still on the belt drifts the player along it.
local player = Player.new(level)
player:reset({ ring = conveyor.ring, side = conveyor.side, offset = conveyor.offset })
local s0 = player.s
for _ = 1, 30 do
	player:step(1 / 120, {}, obstacles)
end
local drift = level:ringDistance(conveyor.ring, player.s, s0)
assert(math.abs(drift - 2.6 * 30 / 120) < 1e-6, `belt drift was {drift}`)
print("obstacles, totem and player checks passed")

-- Candy: crumbling tiles, the moving platform and the key door.
local candyObs = Obstacles.new(candy, workspace)
local crumble = candy.def.crumbles[1]
local crumbleS = candy:spotS(crumble)
assert(candyObs:carry(crumble.ring, crumbleS) == 0, "an intact crumble is floor")
local ev = candyObs:update(1 / 120, { ring = crumble.ring, s = crumbleS, grounded = true })
assert(ev.crumbled, "stepping on a crumble sets it shaking")
for _ = 1, 72 do
	candyObs:update(1 / 120, { ring = 4, s = 0, grounded = true })
	candyObs:render(1 / 120)
end
assert(candyObs:carry(crumble.ring, crumbleS) == nil, "a fallen crumble is a gap")
for _ = 1, 60 do
	candyObs:update(1 / 120, { ring = 4, s = 0, grounded = true })
end
assert(candyObs.crumbles[1].state == "gone", "the crumble is gone after it falls")
candyObs:reset(false)
assert(candyObs:carry(crumble.ring, crumbleS) == 0, "a death restores crumbles")

local plat = candyObs.platforms[1]
candyObs:update(0.5, { ring = 4, s = 0, grounded = true })
local onPlat = candyObs:carry(plat.span.ring, plat.s)
assert(onPlat and math.abs(onPlat - plat.vel) < 1e-9 and plat.vel ~= 0, "the platform carries you at its speed")
local farSide = plat.s + (plat.span.half - 0.3) * (if candy:ringDelta(plat.span.ring, plat.s, plat.span.center) > 0 then -1 else 1)
assert(candyObs:carry(plat.span.ring, farSide) == nil, "the gap beside the platform drops you")

local door = candy.def.locks[1].ladder
assert(candyObs:lockKind(door) == "key" and not candyObs:isLadderOpen(door), "key door starts locked")
assert(candyObs:unlockKeyDoors() and candyObs:isLadderOpen(door), "the key opens the door")
assert(not candyObs:unlockKeyDoors(), "a second key does nothing")
for _ = 1, 90 do
	candyObs:update(1 / 120, { ring = 4, s = 0, grounded = true })
end
candyObs:reset(true)
assert(not candyObs:isLadderOpen(door), "a fresh round relocks the door")
candyObs:destroy()

local candyItems = Items.new(candy, workspace)
candyItems:spawn()
candyItems:update(1 / 60)
local keyCount = 0
for _, it in candyItems.list do
	if it.type == "key" then keyCount += 1 end
end
assert(keyCount == 1, "candy has one key")
candyItems:destroy()

local Barrels = require({ __module = "client/Barrels" })
local barrels = Barrels.new(level, workspace)
barrels:spawn(vec(0, 20, 0))
barrels:setLevel(candy, Obstacles.new(candy, workspace), "gumball")
assert(barrels:count() == 0 and #barrels.pool == 0, "a new look drops the old pool")
barrels:spawn(vec(0, 20, 0))
for _ = 1, 600 do
	barrels:update(1 / 120)
end
barrels:render(1 / 60)
assert(barrels:burst()[1] == require({ __module = "shared/Config" }).COLORS.pink, "gumball burst")

-- Tumbleweeds are bigger and bounce as they roll.
local desert = Level.new(Levels[3])
before = counts.Part
World.build(desert, workspace)
print("desert world parts:", counts.Part - before)
barrels:setLevel(desert, Obstacles.new(desert, workspace), "tumbleweed")
barrels:spawn(vec(0, 20, 0))
local weed = barrels.list[1]
assert(math.abs(weed.radius - 0.42 * 1.1) < 1e-9 and #weed.parts == 28, "a tumbleweed is 28 twigs at 1.1x")
local hopped = 0
for _ = 1, 240 do
	barrels:update(1 / 120)
	if weed.state == "roll" then hopped = math.max(hopped, weed.lift) end
end
barrels:render(1 / 60)
assert(hopped > 0.3, `tumbleweed should hop (max lift {hopped})`)

-- Pumpkins split into two smaller halves on their first chute landing.
barrels:setLevel(level, obstacles, "pumpkin")
barrels.ladderChance = 0
local splits = 0
barrels.onSplit = function()
	splits += 1
end
barrels:spawn(vec(0, 20, 0))
for _ = 1, 120 * 20 do
	barrels:update(1 / 120)
	barrels:render(1 / 120)
	if splits > 0 then break end
end
assert(splits == 1 and barrels:count() == 2, `the pumpkin should split in two ({splits} splits, {barrels:count()} alive)`)
local half = barrels.list[1]
assert(math.abs(half.radius - 0.42 * 1.15 * 0.75) < 1e-9 and half.split, "halves are 0.75x and don't split again")
local halfParts = half.parts
barrels:clear()
assert(math.abs(halfParts[1].Size.X - 0.42 * 1.15 * 2 * 2) < 1e-6, "pooled halves are restored to full size")
barrels.onSplit = nil
print("candy obstacle, item and barrel checks passed")

local Particles = require({ __module = "client/Particles" })
local particles = Particles.new(workspace)
particles:burst(vec(0, 5, 0), { Color3.fromRGB(255, 0, 0) }, 30, 6)
particles:update(1 / 60)
assert(#particles.live == 30, "burst should spawn 30")
for _ = 1, 120 do
	particles:update(1 / 60)
end
assert(#particles.live == 0 and #particles.pool == 30, "particles should expire back into the pool")
for _ = 1, 20 do
	particles:burst(vec(0, 5, 0), { Color3.fromRGB(255, 0, 0) }, 14, 5)
end
assert(#particles.live <= 160, "live particles are capped")

local Combo = require({ __module = "client/Combo" })
local combo = Combo.new()
assert(combo:hit() == 1 and combo:hit() == 2, "chained jumps multiply")
combo:update(3)
assert(combo:hit() == 1, "the chain resets after the window")
print("particles and combo checks passed")

-- Audio: blank asset IDs stay silent; with IDs, cues come from the pool and go back after their length.
NumberRange = { new = function(a, b) return { Min = a, Max = b } end }
local delayed = {}
task = { spawn = function(f, ...) f(...) end, delay = function(_, f) table.insert(delayed, f) end }
function Obj:Play() self.IsPlaying = true end
function Obj:Stop() self.IsPlaying = false; self.TimePosition = 0 end
function Obj:Pause() self.IsPlaying = false end
function Obj:Resume() self.IsPlaying = true end
rs.PreloadAsync = function() end
local SoundAssets = require({ __module = "client/SoundAssets" })
local Audio = require({ __module = "client/Audio" })
local silent = Audio.new()
silent:play("jump")
silent:startMusic()
silent:setHammer(true)
silent:stopMusic()
SoundAssets.sfx = "rbxassetid://1"
SoundAssets.themes = { meadow = { music = "rbxassetid://2", hammer = "rbxassetid://3" } }
local audio = Audio.new()
for _, s in audio.idle do s.IsLoaded = true end
local cue = require({ __module = "client/SoundSprite" }).cues.score
audio:play("score", 2 ^ (2 / 12))
local s = next(audio.busy)
assert(s and s.TimePosition == cue.start and s.PlaybackRegion.Max == cue.start + cue.length, "cue plays its own range")
assert(#audio.idle == 15, "cue takes a pooled sound")
for _, f in delayed do f() end
assert(#audio.idle == 16 and not s.IsPlaying, "cue returns to the pool")
audio.music.TimePosition, audio.musicHammer.TimePosition = 0, 0
audio:startMusic()
audio.music.TimePosition = 7
audio:setHammer(true)
assert(audio.musicHammer.TimePosition == 7 and audio.music.Volume == 0 and audio.musicHammer.Volume == 1, "hammer swaps loops in sync")
audio:setTheme("volcano")
assert(audio.skin == "volcano" and audio.music.SoundId == "rbxassetid://2", "a theme without audio keeps Meadow")
audio:setTheme("meadow")
assert(audio:toggleMute() and audio.sfxGroup.Volume == 0, "mute silences")
print("audio checks passed")

-- The whole client game: construct, start, and run a few seconds of frames.
function Obj:WaitForChild(name) return self[name] or setmetatable({ _attrs = {} }, Obj) end
function Obj:GetPropertyChangedSignal() return { Connect = function() end } end
TweenInfo = { new = function() return {} end }
local U2 = { __sub = function(a) return a end, __add = function(a) return a end }
UDim2 = { fromScale = function() return setmetatable({}, U2) end, fromOffset = function() return setmetatable({}, U2) end,
	new = function() return setmetatable({}, U2) end }
rs.Create = function() return { Play = function() end, Completed = { Once = function() end, Connect = function() end } } end
rs.GetGuiInset = function() return vec(0, 0, 0), vec(0, 0, 0) end
workspace.CurrentCamera = setmetatable({ _attrs = {}, ViewportSize = { X = 1280, Y = 720 } }, Obj)
function workspace.CurrentCamera:WorldToViewportPoint() return vec(0, 0, 1), true end
local Game = require({ __module = "client/Game" })
local popscotch = Game.new(setmetatable({ _attrs = {} }, Obj))
popscotch:start()
local keys = { left = false, right = true, up = false, down = false }
for frame = 1, 60 * 20 do
	popscotch:update(1 / 60, keys)
	if frame % 90 == 0 then popscotch:pressJump() end
end
print("game ran 20 s, state:", popscotch.state, "score:", popscotch.score)
-- Each cleared round moves on a level, each 6% quicker; after the last it loops back to the meadow.
for i = 2, #Levels do
	popscotch.round = i
	popscotch.lives = 99
	popscotch:_startRound(true)
	local def = popscotch.level.def
	assert(def == Levels[i], `round {i} is level {i}`)
	assert(popscotch.barrels.look == Skins[def.skin].projectile, `{def.name} throws its own projectile`)
	assert(math.abs(popscotch.barrels.speedMul - (1 + 0.06 * (i - 1))) < 1e-9, `{def.name} speed`)
	for frame = 1, 60 * 20 do
		popscotch:update(1 / 60, keys)
		if frame % 90 == 0 then popscotch:pressJump() end
	end
	assert(popscotch.level.def == def, `still on {def.name}`)
	assert(popscotch.boss.look == def.skin and #popscotch.boss.parts > 20, `{def.name} has its own boss`)
	print(`{def.name} ran 20 s, state:`, popscotch.state, "score:", popscotch.score, "lives lost:", 99 - popscotch.lives)
end
-- Harvest woods: hedgehogs, acorns, pumpkins, and a summit sealed until 3 pumpkin relics are in.
popscotch.round = 4
popscotch:_startRound(true)
assert(popscotch.level.def.name == "harvest woods", "level 4 is harvest woods")
assert(#popscotch.crawlers == 3 and #popscotch.hazards.drops == 3 and #popscotch.ghosts == 1, "harvest spawns its critters and acorns")
assert(popscotch.obstacles:lockKind(7) == "relics" and select(2, popscotch.items:relicsLeft()) == 3, "3 pumpkins unseal the summit")
assert(popscotch.barrels.look == "pumpkin", "harvest throws pumpkins")

-- The vine: wait at the lip, jump into the rope as it swings close, let go on the forward swing.
local woods = popscotch.level
local vineDef = woods.def.vines[1]
local vineObs = popscotch.obstacles
local vineS = woods:spotS(vineDef)
local swinger = Player.new(woods)
swinger:reset({ ring = vineDef.ring, side = vineDef.side, offset = vineDef.offset - 2.9 })
local function tick(controls)
	local r = swinger:step(1 / 120, controls, vineObs)
	vineObs:update(1 / 120, { ring = swinger.ring, s = swinger.s, grounded = swinger.state == "ground" })
	return r
end
for _ = 1, 120 * 3 do
	local tip = vineObs:vineTip(1)
	if woods:ringDelta(vineDef.ring, tip.s, vineS) < -1.6 then break end
	tick({})
end
local caught, fell, across = false, false, false
tick({ right = true, jump = true })
for _ = 1, 120 do
	caught = tick({ right = true }).grabbed
	if caught then break end
end
assert(caught and swinger.state == "swing", "jumping into the swinging rope catches it")
vineObs:render(1 / 60)
local prevS = swinger.s
for _ = 1, 120 * 4 do
	local ahead = woods:ringDelta(vineDef.ring, swinger.s, vineS)
	local release = swinger.state == "swing" and ahead > 0.2 and woods:ringDelta(vineDef.ring, swinger.s, prevS) > 0
	prevS = swinger.s
	local r = tick({ jump = release })
	fell = fell or r.fellInPit
	if r.landed then
		across = woods:ringDelta(vineDef.ring, swinger.s, vineS) > 3
		break
	end
end
assert(not fell and across, "letting go on the forward swing lands across the pit")
popscotch.round = #Levels + 4
popscotch:_startRound(true)
assert(#popscotch.ghosts == 2, "each lap adds a ghost")

-- Frost peak: ice eases your speed in, penguins, icicles, and snowballs that grow as they roll.
popscotch.round = 5
popscotch:_startRound(true)
local frost = popscotch.level
assert(frost.def.name == "frost peak" and popscotch.barrels.look == "snowball", "level 5 is frost peak")
local iceSpan = frost.def.ice[1]
local frostObs = popscotch.obstacles
assert(frostObs:grip(iceSpan.ring, frost:spotS(iceSpan)) == 1.6 and frostObs:grip(0, frost:sOf(0, 2, 0)) == math.huge, "ice has grip, floor doesn't")
local skater = Player.new(frost)
skater:reset({ ring = iceSpan.ring, side = iceSpan.side, offset = iceSpan.offset - 2 })
skater:step(1 / 120, { right = true }, frostObs)
assert(skater.vs > 0 and skater.vs < 1, `on ice you pick up speed gradually (vs {skater.vs})`)
assert(#popscotch.crawlers == 3 and popscotch.crawlers[1].rig.parts[1].color == require({ __module = "shared/Config" }).COLORS.black, "frost has penguins")
assert(#popscotch.hazards.drops == 4, "frost has four icicles")
popscotch.barrels:spawn(vec(0, 20, 0))
local ball = popscotch.barrels.list[1]
for _ = 1, 120 * 6 do
	popscotch.barrels:update(1 / 120)
end
popscotch.barrels:render(1 / 60)
assert(ball.radius > 0.42 and ball.radius <= 0.42 * 1.85 + 1e-9, `snowballs grow as they roll ({ball.radius})`)
assert(math.abs(ball.parts[1].Size.X - ball.radius * 2 * 2) < 0.05, "the snowball is drawn at its size")

-- Serpent tomb: fire jets erupt on a beat, snakes rear up, boulders, a mummy on the back of the ground ring.
popscotch.round = 6
popscotch:_startRound(true)
assert(popscotch.level.def.name == "serpent tomb" and popscotch.barrels.look == "boulder", "level 6 is serpent tomb")
assert(#popscotch.crawlers == 5 and #popscotch.hazards.jets == 5 and #popscotch.totems == 1, "tomb has snakes, jets and a mummy")
local tombHaz = popscotch.hazards
local erupted, jetDanger = 0, false
for _ = 1, 120 * 4 do
	local ev = tombHaz:update(1 / 120, { ring = 5, s = 0 })
	tombHaz:render()
	erupted += #ev.erupted
	for _, d in tombHaz.dangers do
		jetDanger = jetDanger or d.kind == "jet"
	end
end
assert(erupted >= 5 and jetDanger, `every jet should erupt within 4 s ({erupted})`)
local snake = popscotch.crawlers[1]
local reared = 0
for _ = 1, 120 * 8 do
	snake:update(1 / 120, popscotch.obstacles)
	snake:render()
	reared = math.max(reared, snake.height)
end
assert(reared > 1, `snakes rear up taller ({reared})`)

-- Volcano isle: scorpions, lava rocks that leave burning patches.
popscotch.round = 7
popscotch:_startRound(true)
assert(popscotch.level.def.name == "volcano isle" and popscotch.barrels.look == "lavarock", "level 7 is volcano isle")
local lava = popscotch.barrels
lava.ladderChance = 0
local scorched = 0
lava.onScorch = function()
	scorched += 1
end
lava:spawn(vec(0, 20, 0))
local sawDanger = false
for _ = 1, 120 * 20 do
	lava:update(1 / 120)
	lava:render(1 / 120)
	sawDanger = sawDanger or #lava.dangers > 0
	if scorched > 0 and #lava.scorches == 0 then break end
end
assert(scorched > 0 and sawDanger and #lava.scorches == 0, "a lava rock leaves a burning patch that fades")
for _, c in popscotch.crawlers do
	c:update(1 / 60, popscotch.obstacles)
	c:render()
end

popscotch.round = #Levels + 1
popscotch:_startRound(true)
assert(popscotch.levelIndex == 1 and math.abs(popscotch.barrels.speedMul - 1.2) < 1e-9, "the second lap is back on the meadow, quicker")
popscotch:skipLevel()
assert(popscotch.levelIndex == 2 and popscotch.state == "ready", "the Studio skip key moves on a level")

-- Each round moves on a time of day; each lap shifts it by one so levels come round at other times.
local TimeOfDay = require({ __module = "shared/TimeOfDay" })
local order = {}
for round = 1, 4 do
	table.insert(order, TimeOfDay.forRound(round, 7))
end
assert(table.concat(order, ",") == "day,dusk,night,day", table.concat(order, ","))
assert(TimeOfDay.forRound(8, 7) == "night", "the second lap starts the meadow at night")
popscotch.round = 3
popscotch:_startRound(true)
assert(popscotch.level.def.skin == "desert" and popscotch.time == "day" and popscotch.backdrop.starStrength == 0, "the desert stays in baking daylight")
popscotch.round = 6
popscotch:_startRound(true)
assert(popscotch.time == "night" and #popscotch.worldGlow > 0, "a later level is night")
local neon = require({ __module = "shared/Config" }) and Enum.Material.Neon
assert(popscotch.worldGlow[1].part.Material == neon and popscotch.backdrop.starStrength == 1, "windows glow and stars show at night")
popscotch.round = 4
popscotch:_startRound(true)
assert(popscotch.time == "day" and popscotch.worldGlow[1].part.Material ~= neon and popscotch.backdrop.starStrength == 0, "daylight is unlit")

-- Hi-score table: one row per name, best score kept, ties rank below the older score.
local HiScore = require({ __module = "shared/HiScore" })
local board = {}
board = HiScore.insert(board, "abc", 500).board
board = HiScore.insert(board, "XYZ", 900).board
local again = HiScore.insert(board, "ABC", 300)
assert(again and not again.improved and again.index == 2, "a lower score leaves the name's best row alone")
local tie = HiScore.insert(board, "QQQ", 500)
assert(tie and tie.index == 3, "a tie ranks below the older score")
assert(HiScore.sanitizeName("a1") == "AAA", "names are padded to three letters")
assert(HiScore.cycleLetter("Z", 1) == "A" and HiScore.cycleLetter("A", -1) == "Z", "letters wrap round")

-- Game over with a table-worthy score asks for initials, then shows the table with that row lit.
popscotch.practice = false
popscotch.scores.board = {}
popscotch.scores.name = nil
popscotch.score = 1234
popscotch.lives = 0
popscotch:_gameOver()
assert(popscotch.state == "initials", `a first score asks for initials ({popscotch.state})`)
popscotch:press("letter", "T")
popscotch:press("letter", "O")
popscotch:press("up")
popscotch:press("jump")
assert(popscotch.state == "gameover", "saving the initials shows the table")
assert(popscotch.scores.board[1].name == "TOB" and popscotch.scores.board[1].score == 1234, "the new row is on the table")
assert(popscotch.hud.view.highlight == 1, "the player's row is highlighted")
-- A returning player whose best isn't beaten goes straight to the table.
popscotch.score = 10
popscotch:_gameOver()
assert(popscotch.state == "gameover" and popscotch.hud.view.highlight == 1, "an unbeaten best skips initials")
popscotch.stateT = 5
popscotch:press("jump")
assert(popscotch.state == "ready", "jump on the table starts a new game")
popscotch:_setState("playing")
popscotch:press("pause")
assert(popscotch.state == "paused", "pause stops the round")
popscotch:update(1 / 60, keys)
popscotch:press("pause")
assert(popscotch.state == "playing", "pause again resumes")
print("hi-score, initials and pause checks passed")
print("total Part instances:", counts.Part)
