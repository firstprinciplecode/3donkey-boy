-- Runs the round on this player's machine. This script owns input; Game owns the rules.

local ContextActionService = game:GetService("ContextActionService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local StarterGui = game:GetService("StarterGui")

local Game = require(script.Game)

local MAX_FRAME_DT = 1 / 20

-- Single-player for now: the chat window and player list only cover the score and bonus.
StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Chat, false)
StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.PlayerList, false)

local KEYS = {
	[Enum.KeyCode.Left] = "left",
	[Enum.KeyCode.A] = "left",
	[Enum.KeyCode.Right] = "right",
	[Enum.KeyCode.D] = "right",
	[Enum.KeyCode.Up] = "up",
	[Enum.KeyCode.W] = "up",
	[Enum.KeyCode.Down] = "down",
	[Enum.KeyCode.S] = "down",
	[Enum.KeyCode.Space] = "jump",
	[Enum.KeyCode.M] = "mute",
}

local popscotch = Game.new(Players.LocalPlayer:WaitForChild("PlayerGui"))
local held = { left = false, right = false, up = false, down = false }

local function onKey(_, inputState: Enum.UserInputState, input: InputObject)
	local name = KEYS[input.KeyCode]
	if not name then
		-- Cancel events (focus loss, rebinding) arrive with KeyCode Unknown; drop every held key.
		for key in held do
			held[key] = false
		end
		return Enum.ContextActionResult.Pass
	end
	if inputState == Enum.UserInputState.Begin then
		if name == "jump" then
			popscotch:pressJump()
		elseif name == "mute" then
			popscotch:toggleMute()
		else
			held[name] = true
		end
	elseif held[name] ~= nil then
		held[name] = false
	end
	return Enum.ContextActionResult.Sink
end

local keyList = {}
for key in KEYS do
	table.insert(keyList, key)
end
-- Sinks the keys so Roblox's default movement and camera bindings don't also react to them.
ContextActionService:BindActionAtPriority("PopscotchControls", onKey, false, Enum.ContextActionPriority.High.Value, table.unpack(keyList))

popscotch:start()
RunService:BindToRenderStep("Popscotch", Enum.RenderPriority.Camera.Value + 1, function(rawDt: number)
	popscotch:update(math.min(rawDt, MAX_FRAME_DT), held)
end)
