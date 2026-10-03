-- The player's own Roblox avatar as the climber, for free roam. It walks the collision shell with
-- Roblox's controls; each step reads it back into the ring coordinates the rest of the game uses
-- (ring, s, side, state), so barrels, pickups and hazards treat it like the scripted climber.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Level = require(Shared.Level)

local STUD = Config.STUD
local FREE = Config.FREE_ROAM
local State = Enum.HumanoidStateType
-- The way `s` grows along each side (see Level.squarePoint).
local ALONG = { Vector3.new(1, 0, 0), Vector3.new(0, 0, -1), Vector3.new(-1, 0, 0), Vector3.new(0, 0, 1) }
-- R6 legs are 2 studs and don't count toward HipHeight.
local R6_LEGS = 2
-- Game units under the ground terrace that count as having fallen off.
local FELL_BELOW = -2

local Avatar = {}
Avatar.__index = Avatar

function Avatar.new(level)
	local self = setmetatable({}, Avatar)
	self.level = level
	self.ring = 0
	self.s = 0
	self.side = 0
	self.state = "ground"
	self.facing = 1
	self.moving = false
	self.inPit = false
	self.hasHammer = false
	self.hammerBlink = false
	self.px, self.py, self.pz = 0, 0, 0
	-- Held in place outside play, so the title and game over can't wander off.
	self.frozen = true
	self.home = nil :: CFrame?
	self.jumped = false
	self.landed = false
	local player = Players.LocalPlayer
	player.CharacterAdded:Connect(function(character)
		self:_attach(character)
	end)
	if player.Character then
		task.spawn(self._attach, self, player.Character)
	end
	return self
end

function Avatar:_attach(character: Model)
	local humanoid = character:WaitForChild("Humanoid") :: Humanoid
	local root = character:WaitForChild("HumanoidRootPart") :: BasePart
	self.character, self.humanoid, self.root = character, humanoid, root
	humanoid.UseJumpPower = false
	humanoid.JumpHeight = FREE.jumpHeight
	humanoid.WalkSpeed = Config.PHYSICS.moveSpeed * STUD
	humanoid.StateChanged:Connect(function(_, new)
		if new == State.Jumping then
			self.jumped = true
		elseif new == State.Landed then
			self.landed = true
		end
	end)
	if self.home then
		character:PivotTo(self.home)
	end
	root.Anchored = self.frozen
end

-- Root part centre to the soles of the feet, in studs.
function Avatar:_feetOffset(): number
	local humanoid, root = self.humanoid, self.root
	if not humanoid or not root then
		return 3
	end
	local legs = if humanoid.RigType == Enum.HumanoidRigType.R6 then R6_LEGS else humanoid.HipHeight
	return root.Size.Y / 2 + legs
end

function Avatar:setFrozen(on: boolean)
	self.frozen = on
	if self.root then
		self.root.Anchored = on
		if not on then
			self.root.AssemblyLinearVelocity = Vector3.zero
		end
	end
end

function Avatar:setHammer(on: boolean)
	self.hasHammer = on
	self.hammerBlink = false
end

-- Stands the avatar on a start spot, facing the way `s` grows.
function Avatar:reset(spot)
	local L = self.level
	local x, z, side = L:ringPoint(spot.ring, L:spotS(spot))
	local y = L:tierTop(spot.ring)
	local centre = Vector3.new(x, y, z) * STUD + Vector3.yAxis * (self:_feetOffset() + 0.1)
	self.home = CFrame.lookAt(centre, centre + ALONG[side + 1])
	self.state = "ground"
	self.inPit = false
	self:setHammer(false)
	if self.character then
		self.character:PivotTo(self.home)
	end
	if self.root then
		self.root.AssemblyLinearVelocity = Vector3.zero
	end
	self.px, self.py, self.pz = x, y, z
	self.ring, self.side, self.s = spot.ring, side, L:spotS(spot)
end

function Avatar:die()
	self.state = "dead"
	self:setFrozen(true)
end

function Avatar:onVerticalPart(): boolean
	return self.state == "ladder"
end

function Avatar:isWalking(): boolean
	return self.moving and self.state == "ground"
end

function Avatar:isClimbing(): boolean
	return self.moving and self.state == "ladder"
end

-- Reads the avatar back into game units and ring coordinates.
function Avatar:_read()
	local root, humanoid = self.root, self.humanoid
	if not root or not humanoid or not root.Parent then
		return
	end
	local L = self.level
	local feet = root.Position - Vector3.yAxis * self:_feetOffset()
	self.px, self.py, self.pz = feet.X / STUD, feet.Y / STUD, feet.Z / STUD
	local side, offset = Level.squareCoords(self.px, self.pz)
	self.ring = math.clamp(math.floor((self.py + 0.25) / L.def.tierHeight), 0, L.ringCount - 1)
	self.side = side
	self.s = L:sOf(self.ring, side, offset)

	if self.state ~= "dead" then
		local now = humanoid:GetState()
		self.state = if now == State.Climbing
			then "ladder"
			elseif now == State.Freefall or now == State.Jumping or now == State.FallingDown then "air"
			else "ground"
	end
	self.moving = humanoid.MoveDirection.Magnitude > 0.1
	local along = root.CFrame.LookVector:Dot(ALONG[side + 1])
	if math.abs(along) > 0.3 then
		self.facing = if along > 0 then 1 else -1
	end
end

-- Same contract as Player:step. Roblox does the moving; this reports what happened.
function Avatar:step(_dt: number, _controls, env)
	local result = {
		jumped = false,
		landed = false,
		reachedSummit = false,
		fellInPit = false,
		hammerBlocked = false,
		bounced = false,
		grabbed = false,
		blockedLadder = nil :: number?,
	}
	self:_read()
	result.jumped, result.landed = self.jumped, self.landed
	self.jumped, self.landed = false, false

	local L = self.level
	if self.py >= L:tierTop(L.summitTier) - 0.2 then
		result.reachedSummit = true
	elseif self.py < FELL_BELOW then
		result.fellInPit = true
	elseif self.state == "ground" and env:carry(self.ring, self.s) == nil then
		-- The shell is solid over pits and crumbled tiles, so stepping onto one counts as falling in.
		self.inPit = true
		result.fellInPit = true
	end
	return result
end

return Avatar
