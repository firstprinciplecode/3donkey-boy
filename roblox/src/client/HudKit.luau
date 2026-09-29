-- Building blocks shared by the HUD and the touch controls, styled after the web's CSS: rounded
-- type, cream plates with ink borders and drop shadows, and drawn arrows (the Roblox fonts have none).

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("Shared").Config)

local C = Config.COLORS

local HudKit = {}

HudKit.FONT = Enum.Font.FredokaOne
HudKit.INK = C.black
HudKit.CREAM = C.cream
HudKit.TEAL = Color3.fromRGB(42, 208, 194)

function HudKit.text(parent: Instance, text: string, size: number, color: Color3?): TextLabel
	local l = Instance.new("TextLabel")
	l.BackgroundTransparency = 1
	l.BorderSizePixel = 0
	l.Font = HudKit.FONT
	l.TextSize = size
	l.TextColor3 = color or HudKit.INK
	l.TextStrokeTransparency = 1
	l.Text = text
	l.Parent = parent
	return l
end

-- A text label sized to its contents, for rows laid out by a UIListLayout.
function HudKit.fitText(parent: Instance, text: string, size: number, order: number, color: Color3?): TextLabel
	local l = HudKit.text(parent, text, size, color)
	l.AutomaticSize = Enum.AutomaticSize.X
	l.Size = UDim2.fromOffset(0, math.ceil(size * 1.4))
	l.LayoutOrder = order
	return l
end

-- Ink outline round the letters, for big display type. Thin strokes on small type turn it into blobs.
function HudKit.outline(l: TextLabel, thickness: number, color: Color3?): UIStroke
	local stroke = Instance.new("UIStroke")
	stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual
	stroke.Color = color or HudKit.INK
	stroke.Thickness = thickness
	stroke.LineJoinMode = Enum.LineJoinMode.Round
	stroke.Parent = l
	return stroke
end

-- The outline has to sit on a frame. A stroke on a TextLabel traces the glyphs instead of the box.
function HudKit.plate(parent: Instance, color: Color3, radius: number, border: number?): Frame
	local plate = Instance.new("Frame")
	plate.BackgroundColor3 = color
	plate.BorderSizePixel = 0
	plate.Parent = parent
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, radius)
	corner.Parent = plate
	local stroke = Instance.new("UIStroke")
	stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	stroke.Color = HudKit.INK
	stroke.Thickness = border or 2
	stroke.Parent = plate
	return plate
end

-- A plate on a solid ink drop, like the web's `box-shadow: 0 3px 0 ink`.
function HudKit.raised(parent: Instance, color: Color3, size: UDim2, radius: number, drop: number, border: number?): (Frame, Frame)
	local wrap = Instance.new("Frame")
	wrap.BackgroundTransparency = 1
	wrap.BorderSizePixel = 0
	wrap.Size = size
	wrap.Parent = parent

	local shadow = Instance.new("Frame")
	shadow.BackgroundColor3 = HudKit.INK
	shadow.BorderSizePixel = 0
	shadow.Position = UDim2.fromOffset(0, drop)
	shadow.Size = UDim2.new(1, 0, 1, -drop)
	shadow.Parent = wrap
	Instance.new("UICorner", shadow).CornerRadius = UDim.new(0, radius)

	local face = HudKit.plate(wrap, color, radius, border)
	face.Size = UDim2.new(1, 0, 1, -drop)
	return wrap, face
end

-- A chevron-headed arrow drawn from bars, pointing `direction` (left, right, up, down).
function HudKit.arrow(parent: Instance, direction: string, size: number?, color: Color3?): Frame
	local s = (size or 16) / 16
	local ink = color or HudKit.INK
	local holder = Instance.new("Frame")
	holder.BackgroundTransparency = 1
	holder.AnchorPoint = Vector2.new(0.5, 0.5)
	holder.Position = UDim2.fromScale(0.5, 0.5)
	holder.Size = UDim2.fromOffset(16 * s, 16 * s)
	holder.Rotation = ({ right = 0, left = 180, up = -90, down = 90 })[direction] or 0
	holder.Parent = parent

	local shaft = Instance.new("Frame")
	shaft.BackgroundColor3 = ink
	shaft.BorderSizePixel = 0
	shaft.AnchorPoint = Vector2.new(0, 0.5)
	shaft.Position = UDim2.fromOffset(1 * s, 8 * s)
	shaft.Size = UDim2.fromOffset(8 * s, 3 * s)
	shaft.Parent = holder
	Instance.new("UICorner", shaft).CornerRadius = UDim.new(1, 0)

	for _, rotation in { -42, 42 } do
		-- Pivot on the tip, so the arms stay joined when they turn.
		local pivot = Instance.new("Frame")
		pivot.BackgroundTransparency = 1
		pivot.AnchorPoint = Vector2.new(0.5, 0.5)
		pivot.Position = UDim2.fromOffset(12 * s, 8 * s)
		pivot.Size = UDim2.fromOffset(14 * s, 14 * s)
		pivot.Rotation = rotation
		pivot.Parent = holder
		local bar = Instance.new("Frame")
		bar.BackgroundColor3 = ink
		bar.BorderSizePixel = 0
		bar.AnchorPoint = Vector2.new(1, 0.5)
		bar.Position = UDim2.fromScale(0.5, 0.5)
		bar.Size = UDim2.fromOffset(7 * s, 3 * s)
		bar.Parent = pivot
		Instance.new("UICorner", bar).CornerRadius = UDim.new(1, 0)
	end
	return holder
end

-- A little figure mid-jump, arms up and legs apart, above a short ground line.
function HudKit.jumpMark(parent: Instance): Frame
	local root = Instance.new("Frame")
	root.BackgroundTransparency = 1
	root.AnchorPoint = Vector2.new(0.5, 0.5)
	root.Position = UDim2.fromScale(0.5, 0.5)
	root.Size = UDim2.fromOffset(40, 46)
	root.Parent = parent
	local function bar(x: number, y: number, w: number, h: number, rotation: number, transparency: number?)
		local b = Instance.new("Frame")
		b.BackgroundColor3 = HudKit.INK
		b.BackgroundTransparency = transparency or 0
		b.BorderSizePixel = 0
		b.AnchorPoint = Vector2.new(0.5, 0.5)
		b.Position = UDim2.fromOffset(x, y)
		b.Size = UDim2.fromOffset(w, h)
		b.Rotation = rotation
		b.Parent = root
		Instance.new("UICorner", b).CornerRadius = UDim.new(1, 0)
		return b
	end
	bar(20, 7, 9, 9, 0)
	bar(20, 20, 6, 13, 0)
	bar(13, 13, 4, 12, -35)
	bar(27, 13, 4, 12, 35)
	bar(16, 32, 4, 12, 25)
	bar(24, 32, 4, 12, -25)
	bar(20, 44, 22, 3, 0, 0.45)
	return root
end

-- A speaker mark. `slash` is shown when the sound is off.
function HudKit.speaker(parent: Instance): (Frame, Frame)
	local root = Instance.new("Frame")
	root.BackgroundTransparency = 1
	root.Size = UDim2.fromScale(1, 1)
	root.Parent = parent

	local body = Instance.new("Frame")
	body.BackgroundColor3 = HudKit.INK
	body.BorderSizePixel = 0
	body.AnchorPoint = Vector2.new(0, 0.5)
	body.Position = UDim2.fromScale(0.18, 0.5)
	body.Size = UDim2.fromOffset(7, 10)
	body.Parent = root

	local function wave(xScale: number, height: number)
		local bar = Instance.new("Frame")
		bar.BackgroundColor3 = HudKit.INK
		bar.BorderSizePixel = 0
		bar.AnchorPoint = Vector2.new(0.5, 0.5)
		bar.Position = UDim2.fromScale(xScale, 0.5)
		bar.Size = UDim2.fromOffset(3, height)
		bar.Parent = root
		Instance.new("UICorner", bar).CornerRadius = UDim.new(1, 0)
	end
	wave(0.55, 8)
	wave(0.72, 14)

	local slash = Instance.new("Frame")
	slash.BackgroundColor3 = HudKit.INK
	slash.BorderSizePixel = 0
	slash.AnchorPoint = Vector2.new(0.5, 0.5)
	slash.Position = UDim2.fromScale(0.5, 0.5)
	slash.Size = UDim2.fromOffset(3, 22)
	slash.Rotation = 40
	slash.Visible = false
	slash.Parent = root
	Instance.new("UICorner", slash).CornerRadius = UDim.new(1, 0)
	return root, slash
end
function HudKit.keycap(parent: Instance, text: string, order: number, arrow: string?): Frame
	local width = if arrow then 32 elseif #text <= 1 then 32 else 18 + #text * 9
	local wrap, face = HudKit.raised(parent, HudKit.CREAM, UDim2.fromOffset(width, 34), 7, 3, 3)
	wrap.LayoutOrder = order
	if arrow then
		HudKit.arrow(face, arrow)
	else
		local glyph = HudKit.text(face, text, if #text > 1 then 14 else 16)
		glyph.Size = UDim2.fromScale(1, 1)
	end
	return wrap
end

-- Green 1-Up coin for the lives row.
function HudKit.lifeBadge(parent: Instance, order: number): Frame
	local plate = HudKit.plate(parent, C.grass, 17, 3)
	plate.LayoutOrder = order
	plate.Size = UDim2.fromOffset(32, 32)
	local ring = plate:FindFirstChildOfClass("UIStroke")
	if ring then
		ring.Color = Color3.fromRGB(79, 141, 28)
	end
	local badge = HudKit.text(plate, "1-Up", 10, HudKit.CREAM)
	badge.Size = UDim2.fromScale(1, 1)
	return plate
end

-- A horizontal row that lays its children out left to right in LayoutOrder.
function HudKit.row(parent: Instance, gap: number, height: number, align: Enum.HorizontalAlignment?): Frame
	local row = Instance.new("Frame")
	row.BackgroundTransparency = 1
	row.AutomaticSize = Enum.AutomaticSize.X
	row.Size = UDim2.fromOffset(0, height)
	row.Parent = parent
	local layout = Instance.new("UIListLayout")
	layout.FillDirection = Enum.FillDirection.Horizontal
	layout.HorizontalAlignment = align or Enum.HorizontalAlignment.Left
	layout.VerticalAlignment = Enum.VerticalAlignment.Center
	layout.Padding = UDim.new(0, gap)
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Parent = row
	return row
end

return HudKit
