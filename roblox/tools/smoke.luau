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
Vector3 = { new = vec, zero = vec(0,0,0), yAxis = vec(0,1,0), xAxis = vec(1,0,0), zAxis = vec(0,0,1) }
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
print("total Part instances:", counts.Part)
