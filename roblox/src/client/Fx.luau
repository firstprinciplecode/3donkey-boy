-- The web's print look (#fx and #foreground in src/style.css): a warm fade up from the bottom of
-- the screen and a pale one down from the top, plus big out-of-focus ghosts at the edges, like the
-- poster's depth of field.
--
-- CSS blurs the ghosts. Roblox can't blur a GUI, so they're flat voxel ghosts floating just in
-- front of the camera, and a DepthOfFieldEffect blurs everything that close.

local Lighting = game:GetService("Lighting")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("Shared").Config)

local Voxel = require(script.Parent.Voxel)

local C = Config.COLORS

-- The web's --fx-top and --fx-bottom per time of day: colour and opacity.
local FADES = {
	day = { top = { Color3.fromRGB(255, 255, 255), 0.28 }, bottom = { Color3.fromRGB(255, 110, 90), 0.2 } },
	dusk = { top = { Color3.fromRGB(255, 220, 190), 0.18 }, bottom = { Color3.fromRGB(255, 90, 70), 0.26 } },
	night = { top = { Color3.fromRGB(150, 170, 255), 0.08 }, bottom = { Color3.fromRGB(60, 40, 120), 0.3 } },
}

-- The ghost sprite from src/backdrop.ts, on a 22 x 18 grid: x, y, width, height, colour, opacity.
local GHOST_RECTS = {
	{ 5, 0, 12, 6, C.cyan, 0.8 },
	{ 8, 2, 6, 3, C.charcoal, 1 },
	{ 4, 6, 14, 8, C.black, 1 },
	{ 0, 6, 4, 2, C.black, 1 },
	{ 1, 8, 3, 2, C.black, 1 },
	{ 18, 6, 4, 2, C.black, 1 },
	{ 18, 8, 3, 2, C.black, 1 },
	{ 6, 8, 2, 2, C.pink, 1 },
	{ 14, 8, 2, 2, C.pink, 1 },
	{ 7, 11, 1, 2, C.cream, 1 },
	{ 9, 11, 1, 2, C.cream, 1 },
	{ 12, 11, 1, 2, C.cream, 1 },
	{ 14, 11, 1, 2, C.cream, 1 },
	{ 5, 14, 1, 2, C.black, 1 },
	{ 8, 14, 1, 3, C.black, 1 },
	{ 11, 14, 1, 2, C.black, 1 },
	{ 13, 14, 1, 3, C.black, 1 },
	{ 16, 14, 1, 2, C.black, 1 },
}
local GRID_W, GRID_H = 22, 18
local OPACITY = 0.85

-- Screen placements from the .g-c, .g-d and .g-e rules: width as a fraction of the screen width,
-- where its left/right and top/bottom edges sit, and a phase for its hover.
local GHOSTS = {
	{ width = 0.26, right = -0.05, top = 0.02, phase = 0 },
	{ width = 0.26, left = -0.06, bottom = -0.04, phase = 2 },
	{ width = 0.2, right = -0.04, bottom = -0.06, phase = 4 },
}
-- How far in front of the camera the ghosts float, in studs. Well inside the blurred near zone.
local DEPTH = 16

local Fx = {}
Fx.__index = Fx

local function fadeStrip(gui: Instance, top: boolean, height: number): (Frame, UIGradient)
	local strip = Instance.new("Frame")
	strip.BorderSizePixel = 0
	strip.BackgroundColor3 = Color3.new(1, 1, 1)
	strip.AnchorPoint = Vector2.new(0, if top then 0 else 1)
	strip.Position = UDim2.fromScale(0, if top then 0 else 1)
	strip.Size = UDim2.fromScale(1, height)
	strip.ZIndex = 0
	strip.Parent = gui
	local gradient = Instance.new("UIGradient")
	gradient.Rotation = 90
	gradient.Parent = strip
	return strip, gradient
end

function Fx.new(gui: Instance)
	local self = setmetatable({}, Fx)
	self.t = 0
	self.poster = true
	self.top, self.topGradient = fadeStrip(gui, true, 0.18)
	self.bottom, self.bottomGradient = fadeStrip(gui, false, 0.32)
	self:setTime("day")

	local focus = Instance.new("DepthOfFieldEffect")
	focus.Name = "PosterFocus"
	focus.FarIntensity = 0
	focus.NearIntensity = 0.9
	-- The camera sits CAMERA.distance studs from the pyramid; keep all of it sharp.
	focus.FocusDistance = math.min(200, Config.CAMERA.distance)
	focus.InFocusRadius = 50
	focus.Parent = Lighting
	self.focus = focus

	local folder = Instance.new("Folder")
	folder.Name = "ForegroundGhosts"
	folder.Parent = workspace
	self.folder = folder
	self.ghosts = {}
	self.parts = {}
	self.frames = {}
	for _, spec in GHOSTS do
		local ghost = { spec = spec, rects = {} }
		for i, r in GHOST_RECTS do
			local part = Voxel.part(folder, Vector3.one, r[5], 1 - r[6] * OPACITY)
			part.CastShadow = false
			table.insert(self.parts, part)
			-- Later rects sit a hair nearer the camera so the eyes and teeth draw over the body.
			table.insert(ghost.rects, { x = r[1] + r[3] / 2, y = r[2] + r[4] / 2, w = r[3], h = r[4], z = i * 0.002, part = part })
		end
		table.insert(self.ghosts, ghost)
	end
	return self
end

-- Both fades follow the time of day, like the web's --fx-top and --fx-bottom.
function Fx:setTime(time: string)
	local fade = FADES[time] or FADES.day
	self.top.BackgroundColor3 = fade.top[1]
	self.bottom.BackgroundColor3 = fade.bottom[1]
	self.topGradient.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 1 - fade.top[2]),
		NumberSequenceKeypoint.new(1, 1),
	})
	self.bottomGradient.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 1),
		NumberSequenceKeypoint.new(1, 1 - fade.bottom[2]),
	})
end

-- The blurred edge ghosts and near blur only suit the far poster camera; up close the blur would
-- swallow the runner, so both go away while the camera chases.
function Fx:setPoster(on: boolean)
	if on == self.poster then
		return
	end
	self.poster = on
	self.focus.Enabled = on
	if not on then
		for k = 1, #self.parts do
			self.frames[k] = Voxel.HIDDEN
		end
		workspace:BulkMoveTo(self.parts, self.frames, Enum.BulkMoveMode.FireCFrameChanged)
	end
end

-- Re-places the ghosts in front of the camera; call after the camera has moved this frame.
function Fx:update(dt: number)
	self.t += dt
	if not self.poster then
		return
	end
	local camera = workspace.CurrentCamera
	if not camera or not camera.CFrame or not camera.FieldOfView then
		return
	end
	local view = camera.CFrame
	local size = camera.ViewportSize
	local aspect = size.X / math.max(size.Y, 1)
	local halfH = DEPTH * math.tan(math.rad(camera.FieldOfView) / 2)
	local halfW = halfH * aspect
	-- Resizing parts is slow, so only when the field of view changes (title shot vs play).
	local resize = halfW ~= self.lastHalfW
	self.lastHalfW = halfW
	local k = 1
	for _, ghost in self.ghosts do
		local spec = ghost.spec
		local width = spec.width * 2 * halfW
		local height = width * GRID_H / GRID_W
		local cell = width / GRID_W
		-- Camera space: x runs -halfW..halfW left to right, y runs halfH..-halfH top to bottom.
		-- A CSS `right: -5%` puts the ghost's right edge 5% past the screen's.
		local cx = if spec.right then halfW * (1 - 2 * spec.right) - width / 2 else -halfW * (1 - 2 * spec.left) + width / 2
		local cy = if spec.top then halfH * (1 - 2 * spec.top) - height / 2 else -halfH * (1 - 2 * spec.bottom) + height / 2
		-- The web's hover (7 s, a slow sway and tilt) and bob (3.2 s, a few pixels up and down).
		local hover = math.sin((self.t + spec.phase) * math.pi / 7)
		local bob = math.sin((self.t + spec.phase) * math.pi / 3.2)
		cx += hover * halfW * 0.02
		cy += bob * halfH * 0.02
		local centre = view * CFrame.new(cx, cy, -DEPTH) * CFrame.Angles(0, 0, math.rad(-3 * hover))
		for _, r in ghost.rects do
			if resize then
				r.part.Size = Vector3.new(r.w * cell, r.h * cell, cell * 0.2)
			end
			self.frames[k] = centre * CFrame.new((r.x - GRID_W / 2) * cell, (GRID_H / 2 - r.y) * cell, r.z * cell)
			k += 1
		end
	end
	workspace:BulkMoveTo(self.parts, self.frames, Enum.BulkMoveMode.FireCFrameChanged)
end

return Fx
