-- Shows one face of the pyramid at a time and snaps a quarter turn at corners, like src/stage.ts.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Level = require(Shared.Level)
local Util = require(Shared.Util)

local CAMERA = Config.CAMERA
local STUD = Config.STUD
local POLAR = math.rad(CAMERA.polarDeg)
local YAW_BIAS = math.rad(CAMERA.yawBiasDeg)
local FOLLOW = 4

local CameraRig = {}
CameraRig.__index = CameraRig

local function sideAzimuth(side: number): number
	return side * math.pi / 2 + YAW_BIAS
end

function CameraRig.new()
	local self = setmetatable({}, CameraRig)
	self.focus = Vector3.zero
	self.viewSide = 0
	self.azimuth = sideAzimuth(0)
	self.turn = nil
	return self
end

function CameraRig:snapTo(side: number, focus: Vector3)
	self.viewSide = side
	self.azimuth = sideAzimuth(side)
	self.turn = nil
	self.focus = focus
end

function CameraRig:isTurning(): boolean
	return self.turn ~= nil
end

-- Starts a turn once the player is clearly round a corner, so the view doesn't flicker on the edge.
function CameraRig:watch(x: number, z: number)
	if self.turn then
		return
	end
	local side, offset, radius = Level.squareCoords(x, z)
	if side ~= self.viewSide and math.abs(offset) < radius - CAMERA.turnHysteresis then
		self.viewSide = side
		local delta = (sideAzimuth(side) - self.azimuth + math.pi) % (math.pi * 2) - math.pi
		if math.abs(delta) > 1e-4 then
			self.turn = { from = self.azimuth, to = self.azimuth + delta, t = 0 }
		end
	end
end

function CameraRig:update(dt: number, target: Vector3)
	local turn = self.turn
	if turn then
		turn.t = math.min(1, turn.t + dt / CAMERA.turnDuration)
		self.azimuth = turn.from + (turn.to - turn.from) * Util.easeInOutCubic(turn.t)
		if turn.t >= 1 then
			self.turn = nil
		end
	end

	local f = self.focus
	self.focus = Vector3.new(
		Util.damp(f.X, target.X, FOLLOW, dt),
		Util.damp(f.Y, target.Y, FOLLOW, dt),
		Util.damp(f.Z, target.Z, FOLLOW, dt)
	)

	-- Roblox can swap the Camera object after the player joins, so never cache it.
	local camera = workspace.CurrentCamera
	if not camera then
		return
	end
	camera.CameraType = Enum.CameraType.Scriptable
	local viewport = camera.ViewportSize
	local aspect = viewport.X / math.max(viewport.Y, 1)
	local halfHeight = math.max(CAMERA.minHalfHeight, CAMERA.minHalfWidth / aspect) * STUD
	camera.FieldOfView = math.deg(2 * math.atan(halfHeight / CAMERA.distance))

	local ring = math.sin(POLAR)
	local dir = Vector3.new(ring * math.sin(self.azimuth), math.cos(POLAR), ring * math.cos(self.azimuth))
	local focus = self.focus * STUD
	camera.CFrame = CFrame.lookAt(focus + dir * CAMERA.distance, focus)
end

return CameraRig
