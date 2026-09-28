-- Pickups, ported from src/entities/items.ts: gems, hotdogs, the hammer, the door key, relics, the
-- 1-up coin, the 1-U-P letters and the bonus orbs. Each is a handful of parts that bob and spin around a resting centre;
-- `position` (game units) is that centre, which is what the player has to touch.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Orbs = require(Shared.Orbs)
local PixelFont = require(Shared.PixelFont)
local Skins = require(Shared.Skins)

local Voxel = require(script.Parent.Voxel)

local C = Config.COLORS
local ORBS = Config.ORBS
local RAINBOW = Config.RAINBOW
local STUD = Config.STUD

local LETTERS = { "letter-1", "letter-u", "letter-p" }
local LETTER_CHARS = { ["letter-1"] = "1", ["letter-u"] = "U", ["letter-p"] = "P" }
local ORB_COLORS = { C.red, C.yellow, C.orange, C.teal, C.pink }
local COIN_RADIUS = 0.42

type Piece = { size: Vector3, at: CFrame, color: Color3, glow: boolean?, shape: Enum.PartType? }

local function piece(sx: number, sy: number, sz: number, color: Color3, x: number, y: number, z: number, glow: boolean?): Piece
	return { size = Vector3.new(sx, sy, sz), at = CFrame.new(x, y, z), color = color, glow = glow }
end

local function gem(color: Color3): { Piece }
	local p = piece(0.36, 0.36, 0.36, color, 0, 0, 0, true)
	p.at = CFrame.Angles(math.pi / 4, 0, math.pi / 4)
	return { p }
end

local function hotdog(): { Piece }
	return {
		piece(0.7, 0.18, 0.3, C.tan, 0, -0.05, 0),
		piece(0.84, 0.14, 0.18, C.red, 0, 0.07, 0),
		piece(0.6, 0.03, 0.08, C.yellow, 0, 0.15, 0),
	}
end

local function hammer(): { Piece }
	local tilt = CFrame.Angles(0, 0, 0.4)
	local handle = piece(0.1, 0.8, 0.1, C.brown, 0, -0.1, 0)
	local head = piece(0.5, 0.3, 0.3, C.charcoal, 0, 0.35, 0)
	handle.at = tilt * handle.at
	head.at = tilt * head.at
	return { handle, head }
end

local function key(): { Piece }
	return {
		piece(0.36, 0.36, 0.1, C.yellow, 0, 0.22, 0, true),
		piece(0.14, 0.14, 0.12, C.black, 0, 0.22, 0),
		piece(0.1, 0.5, 0.1, C.yellow, 0, -0.18, 0, true),
		piece(0.18, 0.08, 0.1, C.yellow, 0.1, -0.3, 0, true),
		piece(0.14, 0.08, 0.1, C.yellow, 0.08, -0.14, 0, true),
	}
end

-- Collect every one on a level to open its relic seal. The look comes from the skin.
local function relic(look: string): { Piece }
	if look == "pumpkin" then
		return {
			piece(0.6, 0.46, 0.5, C.orange, 0, 0, 0, true),
			piece(0.42, 0.42, 0.6, C.maple, 0, 0, 0),
			piece(0.1, 0.16, 0.1, C.leafDark, 0, 0.3, 0),
			piece(0.1, 0.08, 0.04, C.yellow, -0.12, 0.06, 0.31, true),
			piece(0.1, 0.08, 0.04, C.yellow, 0.12, 0.06, 0.31, true),
			piece(0.26, 0.06, 0.04, C.yellow, 0, -0.1, 0.31, true),
		}
	elseif look == "present" then
		return {
			piece(0.5, 0.44, 0.5, C.red, 0, 0, 0, true),
			piece(0.1, 0.46, 0.52, C.yellow, 0, 0, 0),
			piece(0.52, 0.46, 0.1, C.yellow, 0, 0, 0),
			piece(0.3, 0.12, 0.12, C.yellow, -0.1, 0.28, 0),
			piece(0.3, 0.12, 0.12, C.yellow, 0.1, 0.28, 0),
		}
	end
	return {
		piece(0.44, 0.1, 0.34, C.gold, 0, -0.3, 0, true),
		piece(0.3, 0.42, 0.26, C.gold, 0, -0.04, 0, true),
		piece(0.36, 0.26, 0.3, C.gold, 0, 0.3, 0, true),
		piece(0.08, 0.08, 0.04, C.teal, -0.08, 0.32, 0.16),
		piece(0.08, 0.08, 0.04, C.teal, 0.08, 0.32, 0.16),
		piece(0.12, 0.08, 0.3, C.teal, 0, 0.47, 0),
	}
end

-- Chunky yellow block letter with an orange extruded back, like the poster's 1-U-P.
local function letter(ch: string): { Piece }
	local cell = 0.13
	local ox = (-PixelFont.W / 2 + 0.5) * cell
	local oy = (-PixelFont.H / 2 + 0.5) * cell
	local pieces = {}
	for _, c in PixelFont.cells(ch) do
		local x = ox + c[1] * cell
		local y = oy + c[2] * cell
		table.insert(pieces, piece(cell, cell, cell * 0.8, C.yellow, x, y, cell * 0.2, true))
		table.insert(pieces, piece(cell, cell, cell * 0.8, C.orange, x + cell * 0.25, y - cell * 0.25, -cell * 0.45))
	end
	return pieces
end

local function orb(colorIndex: number): { Piece }
	local r = ORBS.radius
	local color = ORB_COLORS[colorIndex % #ORB_COLORS + 1]
	local body = piece(r * 2, r * 2, r * 2, color, 0, 0, 0, true)
	body.shape = Enum.PartType.Ball
	local shine = piece(r * 0.56, r * 0.56, r * 0.56, C.cream, -r * 0.38, r * 0.4, r * 0.62, true)
	shine.shape = Enum.PartType.Ball
	return { body, shine }
end

-- Green "1-up" coin from the poster. Roblox cylinders run along X, so turn it to face along Z.
local function coin(): { Piece }
	local depth = COIN_RADIUS * 0.3
	local rim = piece(depth, COIN_RADIUS * 2, COIN_RADIUS * 2, C.grassDark, 0, 0, 0)
	rim.at = CFrame.Angles(0, math.pi / 2, 0)
	rim.shape = Enum.PartType.Cylinder
	return { rim }
end

-- Both flat faces of the coin get the poster's printed face.
local function decorateCoin(rim: Part)
	for _, face in { Enum.NormalId.Left, Enum.NormalId.Right } do
		local gui = Instance.new("SurfaceGui")
		gui.Face = face
		gui.SizingMode = Enum.SurfaceGuiSizingMode.FixedSize
		gui.CanvasSize = Vector2.new(256, 256)
		gui.LightInfluence = 0.3
		local disc = Instance.new("Frame")
		disc.AnchorPoint = Vector2.new(0.5, 0.5)
		disc.Position = UDim2.fromScale(0.5, 0.5)
		disc.Size = UDim2.fromScale(0.98, 0.98)
		disc.BackgroundColor3 = Config.hex(0x8cc63f)
		local corner = Instance.new("UICorner")
		corner.CornerRadius = UDim.new(0.5, 0)
		corner.Parent = disc
		local ring = Instance.new("UIStroke")
		ring.Color = Config.hex(0x4f8d1c)
		ring.Thickness = 10
		ring.Parent = disc
		local text = Instance.new("TextLabel")
		text.BackgroundTransparency = 1
		text.Size = UDim2.fromScale(1, 1)
		text.Font = Enum.Font.GothamBlack
		text.Text = "1-up"
		text.TextSize = 80
		text.TextColor3 = Config.hex(0xfff8e0)
		text.TextStrokeColor3 = C.black
		text.TextStrokeTransparency = 0
		text.Parent = disc
		disc.Parent = gui
		gui.Parent = rim
	end
end

local function makePieces(kind: string, colorIndex: number, relicLook: string?): { Piece }
	local ch = LETTER_CHARS[kind]
	if ch then
		return letter(ch)
	elseif kind == "relic" then
		assert(relicLook, "This level's skin has no relic")
		return relic(relicLook)
	elseif kind == "orb" then
		return orb(colorIndex)
	elseif kind == "gem" then
		return gem(RAINBOW[colorIndex % #RAINBOW + 1])
	elseif kind == "hotdog" then
		return hotdog()
	elseif kind == "hammer" then
		return hammer()
	elseif kind == "key" then
		return key()
	end
	assert(kind == "oneup", `Item type "{kind}" isn't ported yet`)
	return coin()
end

local Items = {}
Items.__index = Items

function Items.new(level, parent: Instance)
	local self = setmetatable({}, Items)
	self.level = level
	self.list = {}
	self.folder = Instance.new("Folder")
	self.folder.Name = "Items"
	self.folder.Parent = parent
	self.moveParts = {}
	self.moveFrames = {}
	return self
end

function Items:_add(kind: string, spot, colorIndex: number)
	local L = self.level
	local x, z = L:ringPoint(spot.ring, L:spotS(spot))
	local lift = if kind == "orb" then ORBS.height else 0.8
	local item = {
		type = kind,
		position = Vector3.new(x, L:tierTop(spot.ring) + lift, z),
		collected = false,
		t = math.random() * 6,
		baseYaw = if LETTER_CHARS[kind] then spot.side * math.pi / 2 else 0,
		yaw = 0,
		parts = {},
		offsets = {},
	}
	item.yaw = item.baseYaw
	local relicDef = Skins[L.def.skin].relic
	for _, p in makePieces(kind, colorIndex, relicDef and relicDef.look) do
		local part = Voxel.part(self.folder, p.size, p.color, 0, p.shape)
		if p.glow then
			part.Material = Enum.Material.Neon
		end
		table.insert(item.parts, part)
		table.insert(item.offsets, p.at.Rotation + p.at.Position * STUD)
	end
	if kind == "oneup" then
		decorateCoin(item.parts[1])
	end
	table.insert(self.list, item)
end

function Items:destroy()
	self.folder:Destroy()
end

function Items:clear()
	self.folder:ClearAllChildren()
	table.clear(self.list)
end

-- Lays out the level's items and orbs afresh; the colour index is the item's position in the list.
function Items:spawn()
	self:clear()
	for i, spawn in self.level.def.items do
		self:_add(spawn.type, spawn.spot, i - 1)
	end
	for i, spot in Orbs.spots(self.level) do
		self:_add("orb", spot, i - 1)
	end
end

function Items:take(item)
	item.collected = true
	for _, part in item.parts do
		part:Destroy()
	end
	table.clear(item.parts)
end

-- Which of the 1, U and P letters have been picked up this level, in that order.
function Items:lettersHeld(): { boolean }
	local held = { false, false, false }
	for _, item in self.list do
		if item.collected then
			local i = table.find(LETTERS, item.type)
			if i then
				held[i] = true
			end
		end
	end
	return held
end

-- Relics still to find, and how many the level has.
function Items:relicsLeft(): (number, number)
	local left, total = 0, 0
	for _, item in self.list do
		if item.type == "relic" then
			total += 1
			if not item.collected then
				left += 1
			end
		end
	end
	return left, total
end

function Items.isLetter(item): boolean
	return LETTER_CHARS[item.type] ~= nil
end

function Items.letterChar(item): string
	return LETTER_CHARS[item.type]
end

function Items:update(dt: number)
	local parts, frames = self.moveParts, self.moveFrames
	for _, item in self.list do
		if not item.collected then
			item.t += dt
			if LETTER_CHARS[item.type] then
				item.yaw = item.baseYaw + math.sin(item.t * 1.8) * 0.5
			elseif item.type ~= "orb" then
				item.yaw += dt * (if item.type == "gem" then 2.2 else 1.3)
			end
			local centre = item.position + Vector3.yAxis * math.sin(item.t * 2.6) * 0.12
			local root = CFrame.new(centre * STUD) * CFrame.Angles(0, item.yaw, 0)
			for i, part in item.parts do
				table.insert(parts, part)
				table.insert(frames, root * item.offsets[i])
			end
		end
	end
	if #parts > 0 then
		workspace:BulkMoveTo(parts, frames, Enum.BulkMoveMode.FireCFrameChanged)
		table.clear(parts)
		table.clear(frames)
	end
end

return Items
