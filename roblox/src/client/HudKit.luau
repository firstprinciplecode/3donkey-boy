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

local WHITE = Color3.new(1, 1, 1)
local contrastStrokes: { [TextLabel]: UIStroke } = setmetatable({}, { __mode = "k" }) :: any

local function luminance(color: Color3): number
	local raw = color :: any
	local r, g, b = raw.R or raw.r, raw.G or raw.g, raw.B or raw.b
	-- Real Color3 channels are 0..1. The smoke double stores 0..255.
	if r > 1 or g > 1 or b > 1 then
		r, g, b = r / 255, g / 255, b / 255
	end
	return 0.299 * r + 0.587 * g + 0.114 * b
end

-- Type that sits straight on the game gets the opposite colour round it, so it reads on any
-- background: light letters take an ink outline, dark ones a white one. Recolour it with `paint`.
function HudKit.contrastOutline(l: TextLabel, thickness: number?): UIStroke
	local stroke = HudKit.outline(l, thickness or math.clamp(l.TextSize / 12, 1, 3))
	contrastStrokes[l] = stroke
	HudKit.paint(l, l.TextColor3)
	return stroke
end

function HudKit.paint(l: TextLabel, color: Color3)
	l.TextColor3 = color
	local stroke = contrastStrokes[l]
	if stroke then
		stroke.Color = if luminance(color) > 0.55 then HudKit.INK else WHITE
	end
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

-- A thin open chevron, two rounded strokes meeting at a tip, pointing `direction`.
function HudKit.chevron(parent: Instance, direction: string, leg: number, thickness: number): Frame
	local reach = leg * math.cos(math.rad(45))
	local holder = Instance.new("Frame")
	holder.BackgroundTransparency = 1
	holder.AnchorPoint = Vector2.new(0.5, 0.5)
	holder.Size = UDim2.fromOffset(reach * 2, reach * 2)
	holder.Rotation = ({ right = 0, left = 180, up = -90, down = 90 })[direction] or 0
	holder.Parent = parent
	for _, rotation in { -45, 45 } do
		-- Pivot on the tip, so the strokes stay joined when they turn.
		local pivot = Instance.new("Frame")
		pivot.BackgroundTransparency = 1
		pivot.AnchorPoint = Vector2.new(0.5, 0.5)
		pivot.Position = UDim2.new(0.5, reach / 2, 0.5, 0)
		pivot.Size = UDim2.fromOffset(0, 0)
		pivot.Rotation = rotation
		pivot.Parent = holder
		local stroke = Instance.new("Frame")
		stroke.BackgroundColor3 = HudKit.INK
		stroke.BorderSizePixel = 0
		stroke.AnchorPoint = Vector2.new(1 - thickness / 2 / (leg + thickness), 0.5)
		stroke.Size = UDim2.fromOffset(leg + thickness, thickness)
		stroke.Parent = pivot
		Instance.new("UICorner", stroke).CornerRadius = UDim.new(1, 0)
	end
	return holder
end

-- The Figma runner from src/assets/touch/jump.svg, traced as rounded strokes in its 14.8 × 15.8
-- viewBox and drawn `scale` pixels per unit.
function HudKit.jumpMark(parent: Instance, scale: number): Frame
	local root = Instance.new("Frame")
	root.BackgroundTransparency = 1
	root.AnchorPoint = Vector2.new(0.5, 0.5)
	root.Position = UDim2.fromScale(0.5, 0.5)
	root.Size = UDim2.fromOffset(14.8 * scale, 15.8 * scale)
	root.Parent = parent
	local function stroke(x1: number, y1: number, x2: number, y2: number, width: number)
		local dx, dy = x2 - x1, y2 - y1
		local b = Instance.new("Frame")
		b.BackgroundColor3 = HudKit.INK
		b.BorderSizePixel = 0
		b.AnchorPoint = Vector2.new(0.5, 0.5)
		b.Position = UDim2.fromOffset((x1 + x2) / 2 * scale, (y1 + y2) / 2 * scale)
		b.Size = UDim2.fromOffset((math.sqrt(dx * dx + dy * dy) + width) * scale, width * scale)
		b.Rotation = math.deg(math.atan2(dy, dx))
		b.Parent = root
		Instance.new("UICorner", b).CornerRadius = UDim.new(1, 0)
	end
	stroke(8.72, 1.65, 8.72, 1.65, 3.29) -- head
	stroke(13.81, 4.6, 11.3, 6.3, 1.97) -- front arm
	stroke(11.3, 6.3, 5.2, 4.55, 1.97) -- shoulders
	stroke(5.2, 4.55, 2.2, 6.25, 1.97) -- back arm
	stroke(7.5, 6.4, 5.9, 10.4, 1.97) -- torso
	stroke(5.6, 10.86, 1.3, 10.86, 1.97) -- back leg
	stroke(6.4, 9.1, 9.4, 8.95, 1.97) -- thigh
	stroke(9.4, 8.95, 12.17, 11.18, 1.97) -- shin
	stroke(0.79, 15.01, 12.8, 15.01, 1.58) -- ground
	return root
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

-- Green 1-Up coin for the lives row: `size` across the face, with a darker ring drawn outside it.
function HudKit.lifeBadge(parent: Instance, order: number, size: number): Frame
	local coin = Instance.new("Frame")
	coin.LayoutOrder = order
	coin.Size = UDim2.fromOffset(size, size)
	coin.BackgroundColor3 = Color3.fromRGB(140, 198, 63)
	coin.BorderSizePixel = 0
	coin.Parent = parent
	Instance.new("UICorner", coin).CornerRadius = UDim.new(1, 0)
	local ring = Instance.new("UIStroke")
	ring.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	ring.Color = Color3.fromRGB(79, 141, 28)
	ring.Thickness = 3
	ring.Parent = coin
	local badge = HudKit.text(coin, "1-Up", 8, WHITE)
	badge.Size = UDim2.fromScale(1, 1)
	return coin
end

-- The bonus star: a yellow glyph with an ink outline, from the Figma HUD.
function HudKit.star(parent: Instance, size: number, order: number): TextLabel
	local star = HudKit.text(parent, "★", size, Color3.fromRGB(255, 208, 0))
	star.Font = Enum.Font.GothamBlack
	star.LayoutOrder = order
	star.Size = UDim2.fromOffset(size, size)
	HudKit.outline(star, 1.5)
	return star
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
