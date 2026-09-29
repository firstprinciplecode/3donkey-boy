-- Snow on frost peak, falling leaves in harvest woods, rising embers on volcano isle: the web's
-- CSS weather layer (src/backdrop.ts and the .weather rules in src/style.css), drawn as a flat
-- screen layer over the world and under the HUD.

local GuiService = game:GetService("GuiService")

local FLAKE_COUNT = 40
local DRIFT = 0.15
local LEAVES = {
	Color3.fromRGB(232, 97, 44),
	Color3.fromRGB(255, 154, 31),
	Color3.fromRGB(255, 210, 58),
	Color3.fromRGB(184, 71, 31),
}
local SNOW = Color3.fromRGB(255, 255, 255)
local EMBER = Color3.fromRGB(255, 176, 64)
local EMBER_GLOW = Color3.fromRGB(255, 90, 31)

local KIND_BY_SKIN = { winter = "snow", autumn = "leaves", volcano = "embers" }

local Weather = {}
Weather.__index = Weather

local function reducedMotion(): boolean
	local ok, on = pcall(function()
		return (GuiService :: any).ReducedMotionEnabled
	end)
	return ok and on == true
end

function Weather.new(gui: Instance)
	local self = setmetatable({}, Weather)
	local layer = Instance.new("Frame")
	layer.Name = "Weather"
	layer.BackgroundTransparency = 1
	layer.Size = UDim2.fromScale(1, 1)
	-- Over the print fade (Fx, 0), under the overlay card (2) and the stat bars (3).
	layer.ZIndex = 1
	layer.ClipsDescendants = true
	layer.Visible = false
	layer.Parent = gui
	self.layer = layer
	self.kind = nil :: string?
	self.flakes = {}

	for i = 1, FLAKE_COUNT do
		local near = math.random() < 0.25
		local size = if near then 7 + math.random() * 5 else 3 + math.random() * 3
		local flake = Instance.new("Frame")
		flake.AnchorPoint = Vector2.new(0.5, 0.5)
		flake.BorderSizePixel = 0
		flake.Size = UDim2.fromOffset(size, size)
		flake.ZIndex = 0
		flake.Parent = layer
		local corner = Instance.new("UICorner")
		corner.CornerRadius = UDim.new(0.5, 0)
		corner.Parent = flake
		local glow = Instance.new("UIStroke")
		glow.Color = EMBER_GLOW
		glow.Thickness = 2
		glow.Transparency = 0.4
		glow.Enabled = false
		glow.Parent = flake
		local dur = if near then 6 + math.random() * 4 else 10 + math.random() * 8
		table.insert(self.flakes, {
			frame = flake,
			corner = corner,
			glow = glow,
			x = math.random(),
			t = math.random(),
			speed = 1 / dur,
			drift = (math.random() - 0.5) * 2 * DRIFT,
			-- Near flakes stand in for the web's blurred ones: softer instead of blurred.
			base = if near then 0.3 else 0,
			leaf = LEAVES[(i - 1) % #LEAVES + 1],
		})
	end
	return self
end

-- Picks the weather for a level skin; skins without any hide the layer.
function Weather:setSkin(skin: string)
	local kind = if reducedMotion() then nil else KIND_BY_SKIN[skin]
	self.kind = kind
	self.layer.Visible = kind ~= nil
	if not kind then
		return
	end
	for _, f in self.flakes do
		f.frame.BackgroundColor3 = if kind == "leaves" then f.leaf elseif kind == "embers" then EMBER else SNOW
		f.corner.CornerRadius = if kind == "leaves" then UDim.new(0, 1) else UDim.new(0.5, 0)
		f.glow.Enabled = kind == "embers"
		f.frame.Rotation = 0
	end
end

function Weather:update(dt: number)
	local kind = self.kind
	if not kind then
		return
	end
	for _, f in self.flakes do
		f.t = (f.t + dt * f.speed) % 1
		local p = f.t
		local x, y, fade = f.x + f.drift * p, -0.04 + p * 1.14, 0
		if kind == "leaves" then
			-- Swings back against its drift halfway down, turning as it goes.
			local sway = if p < 0.5 then -0.6 * (p / 0.5) else -0.6 + 1.6 * ((p - 0.5) / 0.5)
			x = f.x + f.drift * sway
			f.frame.Rotation = 420 * p
		elseif kind == "embers" then
			y = 1.04 - p * 0.74
			fade = if p < 0.15 then 1 - p / 0.15 else (p - 0.15) / 0.85
		end
		f.frame.Position = UDim2.fromScale(x, y)
		local transparency = math.clamp(f.base + (1 - f.base) * fade, 0, 1)
		f.frame.BackgroundTransparency = transparency
		f.glow.Transparency = math.max(0.4, transparency)
	end
end

function Weather:destroy()
	self.layer:Destroy()
end

return Weather
