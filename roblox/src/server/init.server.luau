local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Level = require(Shared.Level)
local Levels = require(Shared.Levels)
local World = require(Shared.World)

-- The climber is drawn by the client, so no Roblox avatar. Set here rather than only in the project
-- file because live sync doesn't reliably apply service properties to an already-open place.
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

-- The template baseplate sits through the bottom tiers; the world brings its own ground.
local baseplate = workspace:FindFirstChild("Baseplate")
if baseplate then
	baseplate:Destroy()
end

local existing = workspace:FindFirstChild("Popscotch")
if existing then
	existing:Destroy()
end
World.build(Level.new(Levels[1]), workspace)
