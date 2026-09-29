-- Runs the round on this player's machine. This script owns input; Game owns the rules.
--
-- Keyboard, gamepad and the on-screen touch controls all feed one set of held directions and
-- pressed actions. Each source keeps its own held set (as in src/input.ts), so letting go of a key
-- doesn't cancel a thumb still on the pad.

local ContextActionService = game:GetService("ContextActionService")
local GuiService = game:GetService("GuiService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local StarterGui = game:GetService("StarterGui")
local UserInputService = game:GetService("UserInputService")

local Game = require(script.Game)
local TouchControls = require(script.TouchControls)

local MAX_FRAME_DT = 1 / 20
local STICK_DEAD_ZONE = 0.45
local DIRECTIONS = { "left", "right", "up", "down" }

-- Single-player for now: the chat window and player list only cover the score and bonus.
StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Chat, false)
StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.PlayerList, false)

local KEYS: { [Enum.KeyCode]: string } = {
	[Enum.KeyCode.Left] = "left",
	[Enum.KeyCode.A] = "left",
	[Enum.KeyCode.Right] = "right",
	[Enum.KeyCode.D] = "right",
	[Enum.KeyCode.Up] = "up",
	[Enum.KeyCode.W] = "up",
	[Enum.KeyCode.Down] = "down",
	[Enum.KeyCode.S] = "down",
	[Enum.KeyCode.Space] = "jump",
	[Enum.KeyCode.Return] = "confirm",
	[Enum.KeyCode.KeypadEnter] = "confirm",
	[Enum.KeyCode.Backspace] = "back",
	[Enum.KeyCode.M] = "mute",
	-- Escape belongs to the Roblox menu, so P is the only pause key.
	[Enum.KeyCode.P] = "pause",
}
-- Start and Select belong to Roblox too, so pause and mute sit on X and Y.
local PAD: { [Enum.KeyCode]: string } = {
	[Enum.KeyCode.DPadLeft] = "left",
	[Enum.KeyCode.DPadRight] = "right",
	[Enum.KeyCode.DPadUp] = "up",
	[Enum.KeyCode.DPadDown] = "down",
	[Enum.KeyCode.ButtonA] = "jump",
	[Enum.KeyCode.ButtonB] = "jump",
	[Enum.KeyCode.ButtonX] = "pause",
	[Enum.KeyCode.ButtonY] = "mute",
}
-- Testing aid: skip ahead a level. Only bound in Studio, never in a published game.
if RunService:IsStudio() then
	KEYS[Enum.KeyCode.N] = "nextLevel"
end

-- Every letter key, so initials can be typed. While not typing, the WASD ones still move.
local LETTERS: { [Enum.KeyCode]: string } = {}
for _, code in Enum.KeyCode:GetEnumItems() do
	if string.match(code.Name, "^[A-Z]$") then
		LETTERS[code] = code.Name
	end
end

local popscotch = Game.new(Players.LocalPlayer:WaitForChild("PlayerGui"))

local sources = {
	keys = { left = false, right = false, up = false, down = false },
	pad = { left = false, right = false, up = false, down = false },
	stick = { left = false, right = false, up = false, down = false },
	touch = { left = false, right = false, up = false, down = false },
}
local held = { left = false, right = false, up = false, down = false }

local function release(set)
	for direction in set do
		set[direction] = false
	end
end

local function press(action: string, letter: string?)
	if action == "nextLevel" then
		popscotch:skipLevel()
	else
		popscotch:press(action, letter)
	end
	if action == "mute" then
		touch:setMuted(popscotch:isMuted())
	end
end

-- Keyboard and gamepad buttons: directions are held, everything else is a press.
local function onButton(_, inputState: Enum.UserInputState, input: InputObject)
	local code = input.KeyCode
	local fromPad = PAD[code] ~= nil
	local action = PAD[code] or KEYS[code]
	local letter = LETTERS[code]
	if not action and not letter then
		-- Cancel events (focus loss, rebinding) arrive with KeyCode Unknown; drop every held key.
		release(sources.keys)
		release(sources.pad)
		return Enum.ContextActionResult.Pass
	end
	local set = if fromPad then sources.pad else sources.keys
	if inputState == Enum.UserInputState.Begin then
		-- Typing initials, a letter means itself, even the ones that normally move.
		if letter and popscotch.state == "initials" then
			press("letter", letter)
		elseif action then
			if set[action] ~= nil then
				set[action] = true
			end
			press(action)
		end
	elseif action and set[action] ~= nil then
		set[action] = false
	end
	return Enum.ContextActionResult.Sink
end

-- Left stick: past the dead zone it holds a direction, and pressing it in counts as a press.
local function onStick(_, _state: Enum.UserInputState, input: InputObject)
	local x, y = input.Position.X, input.Position.Y
	local now = {
		left = x < -STICK_DEAD_ZONE,
		right = x > STICK_DEAD_ZONE,
		up = y > STICK_DEAD_ZONE,
		down = y < -STICK_DEAD_ZONE,
	}
	for _, direction in DIRECTIONS do
		if now[direction] and not sources.stick[direction] then
			press(direction)
		end
		sources.stick[direction] = now[direction]
	end
	return Enum.ContextActionResult.Sink
end

local codes = {}
for code in KEYS do
	table.insert(codes, code)
end
for code in PAD do
	table.insert(codes, code)
end
for code in LETTERS do
	if not KEYS[code] then
		table.insert(codes, code)
	end
end
-- Sinks the keys so Roblox's default movement and camera bindings don't also react to them.
ContextActionService:BindActionAtPriority("PopscotchControls", onButton, false, Enum.ContextActionPriority.High.Value, table.unpack(codes))
ContextActionService:BindActionAtPriority("PopscotchStick", onStick, false, Enum.ContextActionPriority.High.Value, Enum.KeyCode.Thumbstick1)

local touch = TouchControls.new(popscotch.hud.gui, {
	setHeld = function(direction, on)
		sources.touch[direction] = on
	end,
	press = press,
})

-- Prompts and the on-screen controls follow whatever the player used last.
local function modeFor(inputType: Enum.UserInputType): string?
	if inputType == Enum.UserInputType.Touch then
		return "touch"
	end
	if string.match(inputType.Name, "^Gamepad") then
		return "pad"
	end
	-- Mouse clicks leave the mode alone, so the touch buttons can be clicked in Studio.
	if inputType == Enum.UserInputType.Keyboard then
		return "keys"
	end
	return nil
end
local function setMode(mode: string?)
	if not mode then
		return
	end
	touch:setVisible(mode == "touch")
	if mode ~= "touch" then
		release(sources.touch)
	end
	popscotch:setInputMode(mode)
end
UserInputService.LastInputTypeChanged:Connect(function(inputType)
	setMode(modeFor(inputType))
end)
if GuiService:IsTenFootInterface() or (UserInputService.GamepadEnabled and not UserInputService.KeyboardEnabled and not UserInputService.TouchEnabled) then
	setMode("pad")
elseif UserInputService.TouchEnabled and not UserInputService.KeyboardEnabled then
	setMode("touch")
end

popscotch:start()
UserInputService.WindowFocusReleased:Connect(function()
	popscotch:autoPause()
end)
GuiService.MenuOpened:Connect(function()
	popscotch:autoPause()
end)
RunService:BindToRenderStep("Popscotch", Enum.RenderPriority.Camera.Value + 1, function(rawDt: number)
	for _, direction in DIRECTIONS do
		held[direction] = sources.keys[direction] or sources.pad[direction] or sources.stick[direction] or sources.touch[direction]
	end
	popscotch:update(math.min(rawDt, MAX_FRAME_DT), held)
end)
