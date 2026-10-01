-- On-screen pad and buttons for touch screens, ported from src/touch.ts: a direction pad on the
-- left, a big jump button on the right, and pause and mute up by the stats. They feed the same
-- actions as the keyboard and are shown only while the player is using touch.

local GuiService = game:GetService("GuiService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")

local Config = require(ReplicatedStorage:WaitForChild("Shared").Config)

local HudKit = require(script.Parent.HudKit)
local ImageAssets = require(script.Parent.ImageAssets)

local C = Config.COLORS
-- Fraction of the pad's radius the thumb has to travel before a direction engages.
local ENGAGE = 0.3
local PAD_SIZE = 132
local JUMP_SIZE = 110
-- Both circles' centres sit on one line this far up from the bottom, and this far in from the sides.
local CENTRE_UP = 118
local PAD_IN = 94
local JUMP_IN = 80

export type Handlers = {
	setHeld: (direction: string, on: boolean) -> (),
	press: (action: string) -> (),
}

local TouchControls = {}
TouchControls.__index = TouchControls

local function isPointer(input: InputObject): boolean
	-- Mouse clicks drive the controls too, so they can be tried in Studio without a device.
	return input.UserInputType == Enum.UserInputType.Touch or input.UserInputType == Enum.UserInputType.MouseButton1
end

-- Input positions are measured below the top bar; this ScreenGui draws from the very top.
local function screenPoint(input: InputObject): Vector2
	local inset = GuiService:GetGuiInset()
	return Vector2.new(input.Position.X + inset.X, input.Position.Y + inset.Y)
end

-- Frosted glass: a plain white circle at 40% with no border or drop. Roblox can't blur the game
-- behind a GUI element, so it's the web design minus the background blur.
local function hitTarget(parent: Instance, size: number): (Frame, Frame)
	local wrap, face = HudKit.raised(parent, C.white, UDim2.fromOffset(size, size), size / 2, 0, 0)
	face.BackgroundTransparency = 0.6
	face.Active = true
	local shadow = wrap:FindFirstChildWhichIsA("Frame")
	if shadow and shadow ~= face then
		shadow.BackgroundTransparency = 1
	end
	local stroke = face:FindFirstChildOfClass("UIStroke")
	if stroke then
		stroke:Destroy()
	end
	return wrap, face
end

-- The Figma jumping figure once it's uploaded, a drawn stand-in until then.
local function jumpIcon(parent: Instance)
	if ImageAssets.jump ~= "" then
		local icon = Instance.new("ImageLabel")
		icon.BackgroundTransparency = 1
		icon.AnchorPoint = Vector2.new(0.5, 0.5)
		icon.Position = UDim2.fromScale(0.5, 0.5)
		icon.Size = UDim2.fromOffset(22, 24)
		icon.Image = ImageAssets.jump
		icon.Parent = parent
		return
	end
	local mark = HudKit.jumpMark(parent)
	Instance.new("UIScale", mark).Scale = 0.52
end

function TouchControls.new(gui: Instance, handlers: Handlers)
	local self = setmetatable({}, TouchControls)
	self.handlers = handlers
	self.held = { left = false, right = false, up = false, down = false }

	local root = Instance.new("Frame")
	root.Name = "TouchControls"
	root.BackgroundTransparency = 1
	root.Size = UDim2.fromScale(1, 1)
	root.ZIndex = 6
	root.Visible = false
	root.Parent = gui
	self.root = root

	local padWrap, pad = hitTarget(root, PAD_SIZE)
	padWrap.AnchorPoint = Vector2.new(0.5, 0.5)
	padWrap.Position = UDim2.new(0, PAD_IN, 1, -CENTRE_UP)
	self.padWrap = padWrap
	self.pad = pad
	self.arrows = {}
	local spots = {
		up = UDim2.fromScale(0.5, 0.17),
		down = UDim2.fromScale(0.5, 0.83),
		left = UDim2.fromScale(0.17, 0.5),
		right = UDim2.fromScale(0.83, 0.5),
	}
	for direction, at in spots do
		local arrow = HudKit.chevron(pad, direction, 7.5, 2)
		arrow.Position = at
		self.arrows[direction] = arrow
	end
	self:_lightArrows()

	local jumpWrap, jump = hitTarget(root, JUMP_SIZE)
	jumpWrap.AnchorPoint = Vector2.new(0.5, 0.5)
	jumpWrap.Position = UDim2.new(1, -JUMP_IN, 1, -CENTRE_UP)
	self.jumpWrap = jumpWrap
	jumpIcon(jump)
	self:_button(jump, "jump")

	local menu = HudKit.row(root, 4, 44)
	menu.AnchorPoint = Vector2.new(1, 0.5)
	menu.Position = UDim2.new(1, -12, 0, 29)
	local function alignMenu()
		local band = 0
		local inset = (GuiService :: any).TopbarInset
		if typeof(inset) == "Rect" then
			band = inset.Height
		end
		if band <= 0 then
			band = GuiService:GetGuiInset().Y
		end
		menu.Position = UDim2.new(1, -12, 0, (if band > 0 then band else 58) / 2)
	end
	alignMenu()
	pcall(function()
		GuiService:GetPropertyChangedSignal("TopbarInset"):Connect(alignMenu)
	end)

	local pause = Instance.new("TextButton")
	pause.BackgroundTransparency = 1
	pause.BorderSizePixel = 0
	pause.AutoButtonColor = false
	pause.Font = HudKit.FONT
	pause.TextSize = 22
	pause.TextColor3 = C.black
	pause.Text = "II"
	pause.Size = UDim2.fromOffset(44, 44)
	pause.LayoutOrder = 1
	pause.Parent = menu
	self:_button(pause, "pause")

	local speakerButton = Instance.new("TextButton")
	speakerButton.BackgroundTransparency = 1
	speakerButton.BorderSizePixel = 0
	speakerButton.AutoButtonColor = false
	speakerButton.Text = ""
	speakerButton.Size = UDim2.fromOffset(44, 44)
	speakerButton.LayoutOrder = 2
	speakerButton.Parent = menu
	local _, slash = HudKit.speaker(speakerButton)
	self.speakerSlash = slash
	self:_button(speakerButton, "mute")

	self:_wirePad()
	return self
end

function TouchControls:setMuted(muted: boolean)
	if self.speakerSlash then
		self.speakerSlash.Visible = muted
	end
end

-- Hides just the direction pad and jump button, leaving pause and mute, for clean screenshots.
function TouchControls:setPadHidden(hidden: boolean)
	self.padWrap.Visible = not hidden
	self.jumpWrap.Visible = not hidden
end

function TouchControls:setVisible(on: boolean)
	self.root.Visible = on
	if not on then
		self:_aim(nil)
	end
end

-- A tap that presses an action on the way down and sinks a little while held.
function TouchControls:_button(face: GuiObject, action: string)
	local rest = face.Position
	face.InputBegan:Connect(function(input)
		if isPointer(input) and input.UserInputState == Enum.UserInputState.Begin then
			face.Position = rest + UDim2.fromOffset(0, 3)
			self.handlers.press(action)
		end
	end)
	face.InputEnded:Connect(function(input)
		if isPointer(input) then
			face.Position = rest
		end
	end)
end

function TouchControls:_lightArrows()
	for direction, arrow in self.arrows do
		for _, bar in arrow:GetDescendants() do
			if bar:IsA("Frame") and bar.BackgroundTransparency < 1 then
				bar.BackgroundTransparency = if self.held[direction] then 0 else 0.3
			end
		end
	end
end

-- Held directions follow the thumb's offset from the pad's centre.
function TouchControls:_aim(point: Vector2?)
	local next = { left = false, right = false, up = false, down = false }
	if point then
		local radius = self.pad.AbsoluteSize.X / 2
		local centre = self.pad.AbsolutePosition + self.pad.AbsoluteSize / 2
		local dx = (point.X - centre.X) / radius
		local dy = (point.Y - centre.Y) / radius
		next.left, next.right = dx < -ENGAGE, dx > ENGAGE
		next.up, next.down = dy < -ENGAGE, dy > ENGAGE
	end
	local changed = false
	for direction, on in next do
		if self.held[direction] ~= on then
			self.held[direction] = on
			self.handlers.setHeld(direction, on)
			if on then
				self.handlers.press(direction)
			end
			changed = true
		end
	end
	if changed then
		self:_lightArrows()
	end
end

function TouchControls:_wirePad()
	local tracking: InputObject? = nil
	self.pad.InputBegan:Connect(function(input)
		if isPointer(input) and input.UserInputState == Enum.UserInputState.Begin then
			tracking = input
			self:_aim(screenPoint(input))
		end
	end)
	-- The finger keeps steering after it slides off the pad, until it lifts.
	UserInputService.InputChanged:Connect(function(input)
		if not tracking then
			return
		end
		if input == tracking or (tracking.UserInputType == Enum.UserInputType.MouseButton1 and input.UserInputType == Enum.UserInputType.MouseMovement) then
			self:_aim(screenPoint(input))
		end
	end)
	UserInputService.InputEnded:Connect(function(input)
		if not tracking then
			return
		end
		-- Each finger has its own InputObject, so lifting the one on jump leaves the pad held.
		local mouseUp = tracking.UserInputType == Enum.UserInputType.MouseButton1 and input.UserInputType == Enum.UserInputType.MouseButton1
		if input == tracking or mouseUp then
			tracking = nil
			self:_aim(nil)
		end
	end)
end

return TouchControls
