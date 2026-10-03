local Lighting = game:GetService("Lighting")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local StarterPlayer = game:GetService("StarterPlayer")

local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config"))

-- Set here rather than only in the project file because live sync doesn't reliably apply service
-- properties to an already-open place.
if Config.FREE_ROAM.enabled then
	-- Free roam: each player's own avatar climbs, with Roblox's movement.
	Players.CharacterAutoLoads = true
	StarterPlayer.DevComputerMovementMode = Enum.DevComputerMovementMode.UserChoice
	StarterPlayer.DevTouchMovementMode = Enum.DevTouchMovementMode.UserChoice
	local function allowMovement(player: Player)
		player.DevComputerMovementMode = Enum.DevComputerMovementMode.UserChoice
		player.DevTouchMovementMode = Enum.DevTouchMovementMode.UserChoice
	end
	for _, player in Players:GetPlayers() do
		allowMovement(player)
		if not player.Character then
			player:LoadCharacter()
		end
	end
	Players.PlayerAdded:Connect(allowMovement)
else
	-- The climber is drawn by the client, so no Roblox avatar.
	Players.CharacterAutoLoads = false
	local function removeCharacter(player: Player)
		if player.Character then
			player.Character:Destroy()
		end
		player.CharacterAdded:Connect(function(character)
			task.defer(character.Destroy, character)
		end)
	end
	for _, player in Players:GetPlayers() do
		removeCharacter(player)
	end
	Players.PlayerAdded:Connect(removeCharacter)
end

-- The pyramid floats in the sky, so the template baseplate and spawn have to go.
for _, name in { "Baseplate", "SpawnLocation" } do
	local leftover = workspace:FindFirstChild(name)
	if leftover then
		leftover:Destroy()
	end
end

-- Daylight close to the web build's: bright white sky light, soft green bounce from below.
Lighting.ClockTime = 13.5
Lighting.GeographicLatitude = 35
Lighting.Brightness = 2.2
Lighting.Ambient = Color3.fromRGB(96, 104, 92)
Lighting.OutdoorAmbient = Color3.fromRGB(170, 190, 160)
Lighting.EnvironmentDiffuseScale = 0.3
Lighting.EnvironmentSpecularScale = 0
Lighting.GlobalShadows = true
Lighting.ShadowSoftness = 0.3
Lighting.FogEnd = 100000
local atmosphere = Lighting:FindFirstChildOfClass("Atmosphere")
if atmosphere then
	atmosphere:Destroy()
end

-- Each client builds the level it's on (see client Game:_loadLevel), so clear out any world an
-- older build saved into the place.
local existing = workspace:FindFirstChild("Popscotch")
if existing then
	existing:Destroy()
end

require(script.Scores).start()
