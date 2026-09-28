-- Pooled voxel confetti bursts, ported from src/entities/particles.ts. Positions are in game units.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("Shared").Config)

local Voxel = require(script.Parent.Voxel)

local STUD = Config.STUD
local SIZE = 0.18
local GRAVITY = -18
-- Bursts stack up on busy moments (a spelled 1-U-P plus smashes); past this the oldest are reused.
local MAX_LIVE = 160

local Particles = {}
Particles.__index = Particles

function Particles.new(parent: Instance)
	local self = setmetatable({}, Particles)
	self.folder = Instance.new("Folder")
	self.folder.Name = "Particles"
	self.folder.Parent = parent
	self.live = {}
	self.pool = {}
	self.moveParts = {}
	self.moveFrames = {}
	return self
end

function Particles:burst(at: Vector3, colors: { Color3 }, count: number?, speed: number?)
	local n = count or 14
	local v = speed or 5
	for i = 1, n do
		local p
		if #self.live >= MAX_LIVE then
			p = table.remove(self.live, 1)
		else
			local part = table.remove(self.pool) or Voxel.part(self.folder, Vector3.one * SIZE, colors[1])
			p = { part = part }
		end
		p.part.Color = colors[(i - 1) % #colors + 1]
		local a = math.random() * math.pi * 2
		local s = v * (0.4 + math.random() * 0.8)
		p.pos = at
		p.vel = Vector3.new(math.cos(a) * s, 3 + math.random() * v, math.sin(a) * s * 0.5)
		p.life = 0.6 + math.random() * 0.5
		p.maxLife = p.life
		p.spin = 0
		table.insert(self.live, p)
	end
end

function Particles:update(dt: number)
	local parts, frames = self.moveParts, self.moveFrames
	for i = #self.live, 1, -1 do
		local p = self.live[i]
		p.life -= dt
		if p.life <= 0 then
			table.insert(parts, p.part)
			table.insert(frames, Voxel.HIDDEN)
			table.insert(self.pool, p.part)
			table.remove(self.live, i)
		else
			p.vel += Vector3.yAxis * GRAVITY * dt
			p.pos += p.vel * dt
			p.spin += dt
			p.part.Size = Vector3.one * (SIZE * STUD * p.life / p.maxLife)
			table.insert(parts, p.part)
			table.insert(frames, CFrame.new(p.pos * STUD) * CFrame.Angles(p.spin * 8, p.spin * 6, 0))
		end
	end
	if #parts > 0 then
		workspace:BulkMoveTo(parts, frames, Enum.BulkMoveMode.FireCFrameChanged)
		table.clear(parts)
		table.clear(frames)
	end
end

function Particles:clear()
	for _, p in self.live do
		table.insert(self.moveParts, p.part)
		table.insert(self.moveFrames, Voxel.HIDDEN)
		table.insert(self.pool, p.part)
	end
	table.clear(self.live)
	if #self.moveParts > 0 then
		workspace:BulkMoveTo(self.moveParts, self.moveFrames, Enum.BulkMoveMode.FireCFrameChanged)
		table.clear(self.moveParts)
		table.clear(self.moveFrames)
	end
end

return Particles
