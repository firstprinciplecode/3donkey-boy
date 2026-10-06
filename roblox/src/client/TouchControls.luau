-- On-screen controls for touch screens, ported from src/touch.ts: a direction pad on the left and
-- a big jump button on the right. Pausing is the Roblox menu, which auto-pauses, and jump resumes.
-- They feed the same actions as the keyboard and are shown only while the player is using touch.

local GuiService = game:GetService("GuiService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")

local Config = require(ReplicatedStorage:WaitForChild("Shared").Config)

local HudKit = require(script.Parent.HudKit)

local C = Config.COLORS
-- Fraction of the pad's radius treated as the centre, where the thumb steers nowhere.
local DEAD_CENTRE = 0.12
-- Left and right win unless the thumb is this many times further up or down than sideways.
local VERTICAL_BIAS = 1.4
-- A press shorter than this is a tap: left and right still run for this long, up and down latch a climb.
local TAP_TIME = 0.18
local PAD_SIZE = 132
local JUMP_SIZE = 110
-- Both circles' centres sit on one line this far up from the bottom, and this far in from the sides.
local CENTRE_UP = 118
local PAD_IN = 94
local JUMP_IN = 80

export type Handlers = {
	setHeld: (direction: string, on: boolean) -> (),
	press: (action: string) -> (),
	-- Up or down engaged, and a quick tap on up or down; the game turns taps into a climb that keeps going.
	climbPress: (direction: string) -> (),
	climbTap: (direction: string) -> (),
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

function TouchControls.new(gui: Instance, handlers: Handlers)
	local self = setmetatable({}, TouchControls)
	self.handlers = handlers
	self.held = { left = false, right = false, up = false, down = false }
	self.current = nil :: string?
	self.since = 0
	-- Bumped on every new direction, so a tap's delayed release can tell it was overtaken.
	self.generation = 0

	local root = Instance.new("Frame")
	root.Name = "TouchControls"
	root.BackgroundTransparency = 1
	root.Size = UDim2.fromScale(1, 1)
	root.ZIndex = 6
	root.Visible = false
	root.Parent = gui
	self.root = root

	-- The pad listens across the lower left of the screen, so near misses still steer.
	local zone = Instance.new("Frame")
	zone.Name = "PadZone"
	zone.BackgroundTransparency = 1
	zone.AnchorPoint = Vector2.new(0, 1)
	zone.Position = UDim2.fromScale(0, 1)
	zone.Size = UDim2.fromScale(0.5, 0.7)
	zone.Active = true
	zone.Parent = root
	self.zone = zone

	local padWrap, pad = hitTarget(root, PAD_SIZE)
	pad.Active = false
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
	HudKit.jumpMark(jump, 2.2)
	self:_button(jump, "jump")

	self:_wirePad()
	return self
end

-- Touch has no mute button: the Roblox menu's volume covers it.
function TouchControls:setMuted(_muted: boolean) end

-- Hides the direction pad and jump button, for clean screenshots.
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

-- The one direction a thumb at (dx, dy) of the pad's radius points: no diagonals, sideways first.
local function wedge(dx: number, dy: number): string?
	if math.sqrt(dx * dx + dy * dy) < DEAD_CENTRE then
		return nil
	end
	if math.abs(dy) > math.abs(dx) * VERTICAL_BIAS then
		return if dy < 0 then "up" else "down"
	end
	return if dx < 0 then "left" else "right"
end

function TouchControls:_hold(direction: string, on: boolean)
	if self.held[direction] == on then
		return
	end
	self.held[direction] = on
	self.handlers.setHeld(direction, on)
	if on then
		self.handlers.press(direction)
		if direction == "up" or direction == "down" then
			self.handlers.climbPress(direction)
		end
	end
	self:_lightArrows()
end

-- Ends the current direction. `lifted` is a finger leaving the screen rather than sliding on: a
-- quick tap on left or right keeps running for TAP_TIME, and one on up or down is a climb tap.
function TouchControls:_release(lifted: boolean)
	local direction = self.current
	self.current = nil
	if not direction then
		return
	end
	local held = os.clock() - self.since
	local vertical = direction == "up" or direction == "down"
	if lifted and held < TAP_TIME and not vertical then
		local generation = self.generation
		task.delay(TAP_TIME - held, function()
			if self.generation == generation then
				self:_hold(direction, false)
			end
		end)
		return
	end
	if lifted and held < TAP_TIME then
		self.handlers.climbTap(direction)
	end
	self:_hold(direction, false)
end

-- Points the pad from the thumb's offset to the pad's centre, or lets go with nil.
function TouchControls:_aim(point: Vector2?, lifted: boolean?)
	local next = nil
	if point then
		local radius = self.pad.AbsoluteSize.X / 2
		local centre = self.pad.AbsolutePosition + self.pad.AbsoluteSize / 2
		next = wedge((point.X - centre.X) / radius, (point.Y - centre.Y) / radius)
	end
	if next == self.current and point then
		return
	end
	self:_release(lifted == true)
	if next then
		self.generation += 1
		for direction, on in self.held do
			if on and direction ~= next then
				self:_hold(direction, false)
			end
		end
		self.current = next
		self.since = os.clock()
		self:_hold(next, true)
	end
end

function TouchControls:_wirePad()
	local tracking: InputObject? = nil
	self.zone.InputBegan:Connect(function(input)
		if isPointer(input) and input.UserInputState == Enum.UserInputState.Begin then
			tracking = input
			self:_aim(screenPoint(input))
		end
	end)
	-- The finger keeps steering after it slides off the zone, until it lifts.
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
			self:_aim(nil, true)
		end
	end)
end

return TouchControls
