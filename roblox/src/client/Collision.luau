-- The invisible shell a Roblox avatar walks on in free roam: one solid block per tier, climbable
-- trusses where the ladders are, and a rail round the ground terrace so nobody runs off the world.
-- The voxel art stays non-solid on top of it.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Level = require(Shared.Level)

local STUD = Config.STUD
local FREE = Config.FREE_ROAM
-- Studs. Trusses only come in 2-stud steps.
local TRUSS = 2
local RAIL = 1

local function solid(parent: Instance, size: Vector3, cframe: CFrame, className: string?): BasePart
	local part = Instance.new(className or "Part") :: BasePart
	part.Anchored = true
	part.CanCollide = true
	part.CanQuery = true
	part.CanTouch = false
	part.CastShadow = false
	part.Transparency = 1
	part.Size = size
	part.CFrame = cframe
	part.Parent = parent
	return part
end

local Collision = {}

function Collision.build(level, parent: Instance): Folder
	local folder = Instance.new("Folder")
	folder.Name = "Collision"

	for k = 0, level.summitTier do
		local top = level:tierTop(k)
		local bottom = if k == 0 then -1 else level:tierTop(k - 1)
		local width = 2 * level:tierHalf(k)
		solid(folder, Vector3.new(width, top - bottom, width) * STUD, CFrame.new(0, (top + bottom) / 2 * STUD, 0))
	end

	for _, ladder in level.def.ladders do
		local upper = ladder.ring + 1
		local y0 = level:tierTop(ladder.ring) * STUD
		-- One extra rung over the lip, so the climb carries the avatar onto the ledge.
		local height = (level:tierTop(upper) - level:tierTop(ladder.ring)) * STUD + TRUSS
		local x, z = Level.squarePoint(level:tierHalf(upper) + TRUSS / 2 / STUD, ladder.side, ladder.offset)
		local truss = solid(folder, Vector3.new(TRUSS, height, TRUSS), CFrame.new(x * STUD, y0 + height / 2, z * STUD), "TrussPart")
		truss.Name = "Ladder"
	end

	local half = level:tierHalf(0) * STUD
	local h = FREE.railHeight
	local long = 2 * half + 2 * RAIL
	for _, sign in { 1, -1 } do
		solid(folder, Vector3.new(long, h, RAIL), CFrame.new(0, h / 2, sign * (half + RAIL / 2)))
		solid(folder, Vector3.new(RAIL, h, long), CFrame.new(sign * (half + RAIL / 2), h / 2, 0))
	end

	folder.Parent = parent
	return folder
end

return Collision
