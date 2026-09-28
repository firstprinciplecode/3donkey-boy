-- Client-only display parts: anchored and ignored by physics, raycasts and touches, since they're
-- moved every frame with BulkMoveTo.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("Shared").Config)

local Voxel = {}

-- Parked out of sight when pooled.
Voxel.HIDDEN = CFrame.new(0, -1000, 0)

function Voxel.part(parent: Instance, size: Vector3, color: Color3, transparency: number?, shape: Enum.PartType?): Part
	local part = Instance.new("Part")
	part.Anchored = true
	part.CanCollide = false
	part.CanQuery = false
	part.CanTouch = false
	part.Material = Enum.Material.SmoothPlastic
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	if shape then
		part.Shape = shape
	end
	part.Size = size * Config.STUD
	part.Color = color
	part.Transparency = transparency or 0
	part.Parent = parent
	return part
end

return Voxel
