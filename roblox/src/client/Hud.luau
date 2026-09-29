-- The screen layer, ported from src/hud.ts and the web's CSS: two thin bars of live stats, round
-- banners, score popups, and one overlay card reused for the title, initials entry, game over and
-- pause. Prompts follow whatever the player last used: keyboard, touch or gamepad.

local GuiService = game:GetService("GuiService")
local Lighting = game:GetService("Lighting")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)

local HudKit = require(script.Parent.HudKit)

local C = Config.COLORS
local INK = HudKit.INK
local CREAM = HudKit.CREAM
local text = HudKit.text
local fitText = HudKit.fitText

local LOGO = "POPSCOTCH"
local LOGO_COLORS = { C.orange, C.grass, HudKit.TEAL, C.yellow, C.pink }
local BOARD_ROWS = 10
local BONUS_LOW = 1000
-- Desktop topbar height, for when Roblox hasn't reported the inset yet.
local TOPBAR = 58

-- One line per input mode, like the web's byInput().
local PROMPTS = {
	start = { keys = "Press space to start", touch = "Tap jump to start", pad = "Press A to start" },
	again = { keys = "Press space to play again", touch = "Tap jump to play again", pad = "Press A to play again" },
	resume = { keys = "Press P to resume", touch = "Tap II to resume", pad = "Press X to resume" },
	keep = {
		keys = "Space keeps your initials · Arrows or a letter key change them",
		touch = "Jump keeps your initials · The pad changes them",
		pad = "A keeps your initials · The d-pad changes them",
	},
	enter = {
		keys = "Arrows or a letter key · Space saves",
		touch = "Up and down pick a letter, left and right move · Jump saves",
		pad = "D-pad picks letters · A saves",
	},
}

-- The web's --veil per time of day.
local VEIL = {
	day = { Color3.fromRGB(211, 235, 198), 0.55 },
	dusk = { Color3.fromRGB(120, 80, 120), 0.6 },
	night = { Color3.fromRGB(12, 16, 36), 0.5 },
}

local Hud = {}
Hud.__index = Hud

local function richColor(color: Color3): string
	local raw = color :: any
	local r, g, b = raw.R or raw.r, raw.G or raw.g, raw.B or raw.b
	-- Real Color3 channels are 0..1. The smoke double stores 0..255.
	if r <= 1 and g <= 1 and b <= 1 then
		r, g, b = r * 255, g * 255, b * 255
	end
	return string.format("rgb(%d,%d,%d)", r, g, b)
end

local function logoMarkup(): string
	local parts = table.create(#LOGO)
	for i = 1, #LOGO do
		parts[i] = `<font color="{richColor(LOGO_COLORS[(i - 1) % #LOGO_COLORS + 1])}">{string.sub(LOGO, i, i)}</font>`
	end
	return table.concat(parts)
end

-- "candy hills" -> "Candy Hills"
function Hud.levelTitle(name: string): string
	return (string.gsub(name, "(%a)([%w]*)", function(first, rest)
		return string.upper(first) .. rest
	end))
end

-- Plain total, grouped by thousands: 1800 -> "1,800".
function Hud.formatScore(n: number): string
	local digits = tostring(math.max(0, math.floor(n)))
	local grouped = ""
	for i = 1, #digits do
		if i > 1 and (#digits - i + 1) % 3 == 0 then
			grouped ..= ","
		end
		grouped ..= string.sub(digits, i, i)
	end
	return grouped
end

function Hud.new(playerGui: Instance, levelName: string)
	local self = setmetatable({}, Hud)
	self.mode = "keys"
	self.time = "day"
	self.themed = {} :: { TextLabel }
	self.clock = 0
	self.viewport = Vector2.zero

	local gui = Instance.new("ScreenGui")
	gui.Name = "PopscotchHud"
	gui.ResetOnSpawn = false
	-- Draw into the top strip Roblox reserves for its buttons; the stats sit level with them.
	gui.IgnoreGuiInset = true
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
	gui.Parent = playerGui
	self.gui = gui

	self:_buildCard()
	self:_buildTopBar()
	self:_buildStatusCluster()
	self:_buildBottomBar(levelName)
	self:_buildBanner()

	local popups = Instance.new("Frame")
	popups.Name = "Popups"
	popups.BackgroundTransparency = 1
	popups.Size = UDim2.fromScale(1, 1)
	popups.ZIndex = 5
	popups.Parent = gui
	self.popups = popups

	self:setLives(Config.GAME_RULES.lives)
	self:setBonus(Config.GAME_RULES.bonusStart)
	self:setScore(0)
	self:setHi(0)
	return self
end

-- Text that turns cream at night, like the web's --text.
function Hud:_themed(l: TextLabel, dim: number?): TextLabel
	l.TextTransparency = dim or 0
	table.insert(self.themed, l)
	return l
end

function Hud:_scaled(target: Instance): UIScale
	local scale = Instance.new("UIScale")
	scale.Parent = target
	return scale
end

function Hud:_buildTopBar()
	local top = HudKit.row(self.gui, 10, 36)
	top.Name = "TopBar"
	top.AnchorPoint = Vector2.new(0.5, 0.5)
	top.ZIndex = 3
	self.topScale = self:_scaled(top)
	local function alignWithTopbar()
		local band = 0
		local inset = (GuiService :: any).TopbarInset
		if typeof(inset) == "Rect" then
			band = inset.Height
		end
		if band <= 0 then
			band = GuiService:GetGuiInset().Y
		end
		top.Position = UDim2.new(0.5, 0, 0, (if band > 0 then band else TOPBAR) / 2)
	end
	alignWithTopbar()
	pcall(function()
		GuiService:GetPropertyChangedSignal("TopbarInset"):Connect(alignWithTopbar)
	end)

	self:_themed(fitText(top, "Score", 15, 1), 0.25)
	self.scoreValue = self:_themed(fitText(top, "0", 28, 2))
	self:_themed(fitText(top, "pt", 15, 3), 0.25)
	local hiGap = Instance.new("Frame")
	hiGap.BackgroundTransparency = 1
	hiGap.Size = UDim2.fromOffset(16, 1)
	hiGap.LayoutOrder = 4
	hiGap.Parent = top
	self:_themed(fitText(top, "Hi", 15, 5), 0.25)
	self.hiValue = self:_themed(fitText(top, "0", 20, 6))
	self.topBar = top
end

-- Lives and the 1-U-P letters sit under the direction pad. The bonus is its own cluster under Jump.
function Hud:_buildStatusCluster()
	local cluster = HudKit.row(self.gui, 10, 22)
	cluster.Name = "Status"
	cluster.AnchorPoint = Vector2.new(0, 1)
	cluster.Position = UDim2.new(0, 28, 1, -12)
	cluster.ZIndex = 3
	self.statusCluster = cluster

	local lives = HudKit.row(cluster, 6, 22)
	lives.LayoutOrder = 1
	self.lifeBadges = {}
	for i = 1, Config.GAME_RULES.maxLives do
		local dot = Instance.new("Frame")
		dot.LayoutOrder = i
		dot.Size = UDim2.fromOffset(12, 12)
		dot.BackgroundColor3 = C.grass
		dot.BorderSizePixel = 0
		dot.Parent = lives
		Instance.new("UICorner", dot).CornerRadius = UDim.new(1, 0)
		self.lifeBadges[i] = dot
	end

	local letters = HudKit.row(cluster, 2, 22)
	letters.LayoutOrder = 2
	self.chips = {}
	for i, ch in { "1", "U", "P" } do
		local label = self:_themed(fitText(letters, ch, 16, i), 0.55)
		self.chips[i] = label
	end

	local bonus = HudKit.row(self.gui, 6, 22)
	bonus.Name = "Bonus"
	bonus.AnchorPoint = Vector2.new(0.5, 1)
	bonus.Position = UDim2.new(1, -80, 1, -14)
	bonus.ZIndex = 3
	local mark = Instance.new("Frame")
	mark.LayoutOrder = 1
	mark.Size = UDim2.fromOffset(8, 8)
	mark.BackgroundColor3 = C.yellow
	mark.BorderSizePixel = 0
	mark.Parent = bonus
	Instance.new("UICorner", mark).CornerRadius = UDim.new(1, 0)
	self.bonusValue = self:_themed(fitText(bonus, "", 16, 2))
end

function Hud:_buildBottomBar(levelName: string)
	local bottom = Instance.new("Frame")
	bottom.Name = "BottomBar"
	bottom.BackgroundTransparency = 1
	bottom.AnchorPoint = Vector2.new(0.5, 1)
	bottom.Position = UDim2.new(0.5, 0, 1, -8)
	bottom.Size = UDim2.new(1, -40, 0, 34)
	bottom.ZIndex = 3
	bottom.Parent = self.gui
	self.bottomBar = bottom

	local centre = HudKit.row(bottom, 8, 34)
	centre.AnchorPoint = Vector2.new(0.5, 0)
	centre.Position = UDim2.fromScale(0.5, 0)
	self:_themed(fitText(centre, "Lvl", 15, 1), 0.25)
	self.levelValue = self:_themed(fitText(centre, "1", 17, 2))
	local pill = text(centre, Hud.levelTitle(levelName), 12, CREAM)
	pill.LayoutOrder = 3
	pill.BackgroundColor3 = INK
	pill.BackgroundTransparency = 0
	pill.AutomaticSize = Enum.AutomaticSize.X
	pill.Size = UDim2.fromOffset(0, 20)
	local pad = Instance.new("UIPadding")
	pad.PaddingLeft = UDim.new(0, 8)
	pad.PaddingRight = UDim.new(0, 8)
	pad.Parent = pill
	Instance.new("UICorner", pill).CornerRadius = UDim.new(1, 0)
	self.levelPill = pill
end

function Hud:_buildBanner()
	local banner = Instance.new("Frame")
	banner.Name = "Banner"
	banner.BackgroundTransparency = 1
	banner.AnchorPoint = Vector2.new(0.5, 0.5)
	banner.Position = UDim2.fromScale(0.5, 0.26)
	banner.Size = UDim2.fromOffset(900, 120)
	banner.ZIndex = 4
	banner.Visible = false
	banner.Parent = self.gui
	local stack = Instance.new("UIListLayout")
	stack.HorizontalAlignment = Enum.HorizontalAlignment.Center
	stack.Padding = UDim.new(0, 6)
	stack.SortOrder = Enum.SortOrder.LayoutOrder
	stack.Parent = banner

	local heading = text(banner, "", 64, C.orange)
	heading.LayoutOrder = 1
	heading.Size = UDim2.new(1, 0, 0, 72)
	HudKit.outline(heading, 5)
	local sub = text(banner, "", 24, CREAM)
	sub.LayoutOrder = 2
	sub.Size = UDim2.new(1, 0, 0, 32)
	HudKit.outline(sub, 3)

	self.banner, self.bannerHeading, self.bannerSub = banner, heading, sub
	self.bannerScale = self:_scaled(banner)
end

function Hud:_buildCard()
	local card = Instance.new("Frame")
	card.Name = "Overlay"
	card.BorderSizePixel = 0
	card.Size = UDim2.fromScale(1, 1)
	card.BackgroundColor3 = VEIL.day[1]
	card.BackgroundTransparency = VEIL.day[2]
	card.ZIndex = 2
	card.Visible = false
	card.Parent = self.gui
	self.card = card

	local panel = Instance.new("Frame")
	panel.BackgroundTransparency = 1
	panel.AnchorPoint = Vector2.new(0.5, 0.5)
	panel.Position = UDim2.fromScale(0.5, 0.5)
	panel.Size = UDim2.fromOffset(900, 0)
	panel.AutomaticSize = Enum.AutomaticSize.Y
	panel.Parent = card
	local stack = Instance.new("UIListLayout")
	stack.HorizontalAlignment = Enum.HorizontalAlignment.Center
	stack.Padding = UDim.new(0, 8)
	stack.SortOrder = Enum.SortOrder.LayoutOrder
	stack.Parent = panel
	self.panelScale = self:_scaled(panel)

	local logoHold = Instance.new("Frame")
	logoHold.BackgroundTransparency = 1
	logoHold.LayoutOrder = 1
	logoHold.Size = UDim2.fromOffset(840, 100)
	logoHold.Parent = panel
	local shadow = text(logoHold, LOGO, 84, INK)
	shadow.Size = UDim2.fromScale(1, 1)
	shadow.Position = UDim2.fromOffset(0, 8)
	shadow.TextTransparency = 0.78
	local logo = text(logoHold, logoMarkup(), 84)
	logo.RichText = true
	logo.Size = UDim2.fromScale(1, 1)
	HudKit.outline(logo, 6)
	self.logo = logoHold

	local heading = text(panel, "", 64, C.orange)
	heading.LayoutOrder = 2
	heading.Size = UDim2.fromOffset(860, 76)
	HudKit.outline(heading, 5)
	self.heading = heading

	self.teaser = self:_themed(text(panel, "How high can you climb?", 32))
	self.teaser.LayoutOrder = 3
	self.teaser.Size = UDim2.fromOffset(760, 40)

	self.sub = self:_themed(text(panel, "", 20))
	self.sub.LayoutOrder = 4
	self.sub.Size = UDim2.fromOffset(760, 28)
	self.subScale = self:_scaled(self.sub)

	self:_buildControls(panel)
	self:_buildBoard(panel)
	self:_buildInitials(panel)
end

function Hud:_caption(parent: Instance, words: string, order: number): TextLabel
	return self:_themed(fitText(parent, words, 16, order))
end

-- The controls line under the title, one version per input mode.
function Hud:_buildControls(panel: Instance)
	local holder = Instance.new("Frame")
	holder.BackgroundTransparency = 1
	holder.LayoutOrder = 5
	holder.Size = UDim2.fromOffset(900, 40)
	holder.Parent = panel
	self.controls = holder

	local keys = HudKit.row(holder, 6, 40)
	keys.AnchorPoint = Vector2.new(0.5, 0)
	keys.Position = UDim2.fromScale(0.5, 0)
	local order = 0
	local function add(maker: () -> ())
		order += 1
		maker()
	end
	local function key(label: string, arrow: string?)
		add(function()
			HudKit.keycap(keys, label, order, arrow)
		end)
	end
	local function words(label: string)
		add(function()
			self:_caption(keys, label, order)
		end)
	end
	local function gap()
		add(function()
			local g = Instance.new("Frame")
			g.BackgroundTransparency = 1
			g.Size = UDim2.fromOffset(10, 1)
			g.LayoutOrder = order
			g.Parent = keys
		end)
	end
	key("", "left")
	key("", "right")
	words("Run")
	gap()
	key("", "up")
	key("", "down")
	words("Climb ladders")
	gap()
	key("space")
	words("Jump")
	gap()
	key("p")
	words("Pause ·")
	key("m")
	words("Mute")

	local touch = HudKit.row(holder, 24, 40)
	touch.AnchorPoint = Vector2.new(0.5, 0)
	touch.Position = UDim2.fromScale(0.5, 0)
	self:_caption(touch, "Left pad: run and climb", 1)
	self:_caption(touch, "Right button: jump", 2)

	local pad = HudKit.row(holder, 6, 40)
	pad.AnchorPoint = Vector2.new(0.5, 0)
	pad.Position = UDim2.fromScale(0.5, 0)
	HudKit.keycap(pad, "d-pad", 1)
	self:_caption(pad, "or stick: run and climb", 2)
	local g = Instance.new("Frame")
	g.BackgroundTransparency = 1
	g.Size = UDim2.fromOffset(10, 1)
	g.LayoutOrder = 3
	g.Parent = pad
	HudKit.keycap(pad, "A", 4)
	self:_caption(pad, "Jump ·", 5)
	HudKit.keycap(pad, "X", 6)
	self:_caption(pad, "Pause ·", 7)
	HudKit.keycap(pad, "Y", 8)
	self:_caption(pad, "Mute", 9)

	self.controlRows = { keys = keys, touch = touch, pad = pad }
end

function Hud:_buildBoard(panel: Instance)
	local wrap = Instance.new("Frame")
	wrap.BackgroundTransparency = 1
	wrap.LayoutOrder = 6
	wrap.AutomaticSize = Enum.AutomaticSize.Y
	wrap.Size = UDim2.fromOffset(300, 0)
	wrap.Parent = panel
	local stack = Instance.new("UIListLayout")
	stack.HorizontalAlignment = Enum.HorizontalAlignment.Center
	stack.Padding = UDim.new(0, 2)
	stack.SortOrder = Enum.SortOrder.LayoutOrder
	stack.Parent = wrap
	self.boardWrap = wrap

	local label = self:_themed(text(wrap, "Hi-score", 14), 0.3)
	label.LayoutOrder = 0
	label.Size = UDim2.fromOffset(300, 22)
	local empty = self:_themed(text(wrap, "No scores yet", 17), 0.3)
	empty.LayoutOrder = 1
	empty.Size = UDim2.fromOffset(300, 24)
	self.boardEmpty = empty

	self.boardRows = {}
	for i = 1, BOARD_ROWS do
		local row = Instance.new("Frame")
		row.BackgroundTransparency = 1
		row.LayoutOrder = 1 + i
		row.Size = UDim2.fromOffset(240, 22)
		row.Parent = wrap
		local rank = self:_themed(text(row, tostring(i), 16), 0.45)
		rank.Size = UDim2.fromOffset(28, 22)
		rank.TextXAlignment = Enum.TextXAlignment.Right
		local name = self:_themed(text(row, "", 16))
		name.Position = UDim2.fromOffset(44, 0)
		name.Size = UDim2.fromOffset(70, 22)
		name.TextXAlignment = Enum.TextXAlignment.Left
		local score = self:_themed(text(row, "", 16))
		score.Position = UDim2.fromOffset(120, 0)
		score.Size = UDim2.fromOffset(120, 22)
		score.TextXAlignment = Enum.TextXAlignment.Right
		self.boardRows[i] = { frame = row, rank = rank, name = name, score = score }
	end
end

function Hud:_buildInitials(panel: Instance)
	local wrap = Instance.new("Frame")
	wrap.BackgroundTransparency = 1
	wrap.LayoutOrder = 7
	wrap.Size = UDim2.fromOffset(760, 116)
	wrap.Parent = panel
	self.initials = wrap

	local slots = HudKit.row(wrap, 10, 78)
	slots.AnchorPoint = Vector2.new(0.5, 0)
	slots.Position = UDim2.fromScale(0.5, 0)
	self.slots = {}
	for i = 1, 3 do
		local slot, face = HudKit.raised(slots, CREAM, UDim2.fromOffset(64, 76), 10, 4, 4)
		slot.LayoutOrder = i
		local letter = text(face, "A", 42)
		letter.Size = UDim2.fromScale(1, 1)
		self.slots[i] = { face = face, letter = letter, scale = self:_scaled(slot) }
	end
	local hint = self:_themed(text(wrap, "", 14), 0.25)
	hint.AnchorPoint = Vector2.new(0.5, 0)
	hint.Position = UDim2.new(0.5, 0, 0, 88)
	hint.Size = UDim2.fromOffset(760, 22)
	self.initialsHint = hint
	self.cursor = 1
end

-- Live stats ------------------------------------------------------------------------------------

function Hud:setLevel(index: number, name: string)
	self.levelValue.Text = tostring(index)
	self.levelPill.Text = Hud.levelTitle(name)
end

function Hud:setRound(_round: number) end

function Hud:setScore(score: number)
	self.scoreValue.Text = Hud.formatScore(score)
end

function Hud:setHi(score: number)
	self.hiValue.Text = Hud.formatScore(score)
end

function Hud:setLives(lives: number)
	for i, badge in self.lifeBadges do
		badge.Visible = i <= lives
	end
end

function Hud:setLetters(held: { boolean })
	self.letterHeld = held
	local ink = if self.time == "night" then CREAM else INK
	for i, chip in self.chips do
		local on = held[i] == true
		chip.TextColor3 = if on then C.yellow else ink
		chip.TextTransparency = if on then 0 else 0.55
	end
end

function Hud:setBonus(bonus: number)
	self.bonus = bonus
	self.bonusValue.Text = tostring(bonus)
	self.bonusValue.TextColor3 = if bonus <= BONUS_LOW then C.pink else C.yellow
end

-- Night turns the ink text cream and darkens the veil, like the web's --text and --veil.
function Hud:setTime(time: string)
	self.time = time
	local color = if time == "night" then CREAM else INK
	for _, l in self.themed do
		l.TextColor3 = color
	end
	local veil = VEIL[time] or VEIL.day
	self.card.BackgroundColor3 = veil[1]
	self.card.BackgroundTransparency = veil[2]
	self:_paintBoard()
	if self.bonus then
		self:setBonus(self.bonus)
	end
	if self.letterHeld then
		self:setLetters(self.letterHeld)
	end
end

function Hud:setInputMode(mode: string)
	if mode == self.mode then
		return
	end
	self.mode = mode
	self:_render()
end

function Hud:_prompt(key: string): string
	local set = PROMPTS[key]
	return if set then set[self.mode] or set.keys else key
end

-- Banner, popups ------------------------------------------------------------------------------

function Hud:show(heading: string, sub: string)
	self.bannerHeading.Text = heading
	self.bannerSub.Text = sub
	self.bannerSub.Visible = sub ~= ""
	if not self.banner.Visible then
		self.banner.Visible = true
		self.bannerScale.Scale = 0.8
		TweenService:Create(self.bannerScale, TweenInfo.new(0.25, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {
			Scale = self.fit or 1,
		}):Play()
	end
end

function Hud:hide()
	self.banner.Visible = false
end

-- Floating "100 pt" text that rises and fades from a world position (in studs).
function Hud:popup(words: string, worldPos: Vector3)
	local camera = workspace.CurrentCamera
	if not camera then
		return
	end
	local screen, onScreen = camera:WorldToViewportPoint(worldPos)
	if not onScreen then
		return
	end
	-- This ScreenGui ignores the top-bar inset, so it shares WorldToViewportPoint's origin.
	local popup = text(self.popups, words, 18, CREAM)
	popup.AnchorPoint = Vector2.new(0.5, 0.5)
	popup.Size = UDim2.fromOffset(300, 24)
	popup.Position = UDim2.fromOffset(screen.X, screen.Y)
	local stroke = HudKit.outline(popup, 2.5)
	local info = TweenInfo.new(0.9, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
	local tween = TweenService:Create(popup, info, {
		Position = popup.Position - UDim2.fromOffset(0, 40),
		TextTransparency = 1,
	})
	TweenService:Create(stroke, info, { Transparency = 1 }):Play()
	tween.Completed:Once(function()
		popup:Destroy()
	end)
	tween:Play()
end

-- Overlay card --------------------------------------------------------------------------------

-- Softens the pyramid behind the card the way the web's backdrop blur does.
function Hud:_setBlur(on: boolean)
	local blur = self.blur
	if on and not blur then
		blur = Instance.new("BlurEffect")
		blur.Name = "OverlayBlur"
		blur.Size = 14
		blur.Parent = Lighting
		self.blur = blur
	end
	if blur then
		blur.Enabled = on
	end
end

function Hud:_paintBoard()
	local view = self.view
	local board = if view then view.board else nil
	if not board then
		return
	end
	self.boardEmpty.Visible = #board == 0
	local base = if self.time == "night" then CREAM else INK
	for i, row in self.boardRows do
		local entry = board[i]
		row.frame.Visible = entry ~= nil
		if entry then
			local mine = view.highlight == i
			local color = if mine then C.pink else base
			row.name.Text = string.gsub(entry.name, "(.)", "%1 "):sub(1, -2)
			row.score.Text = Hud.formatScore(entry.score)
			row.name.TextColor3 = color
			row.score.TextColor3 = color
			row.rank.TextColor3 = color
		end
	end
end

function Hud:_render()
	local view = self.view
	if not view then
		return
	end
	local kind = view.kind
	self.logo.Visible = kind == "title"
	self.teaser.Visible = kind == "title"
	self.controls.Visible = kind == "title"
	self.heading.Visible = kind ~= "title"
	self.boardWrap.Visible = kind == "title" or kind == "gameover"
	self.initials.Visible = kind == "initials"
	for mode, row in self.controlRows do
		row.Visible = mode == self.mode
	end

	if kind == "title" then
		self.sub.Text = self:_prompt("start")
	elseif kind == "gameover" then
		self.heading.Text = "Game over"
		self.sub.Text = `Score {Hud.formatScore(view.score)} pt · {self:_prompt("again")}`
	elseif kind == "initials" then
		self.heading.Text = if view.returning then "New personal best!" else "Enter your initials"
		self.sub.Text = `{Hud.formatScore(view.score)} pt`
		self.initialsHint.Text = self:_prompt(if view.returning then "keep" else "enter")
		for i, slot in self.slots do
			slot.letter.Text = view.letters[i] or "A"
			slot.face.BackgroundColor3 = if i == view.cursor then C.yellow else CREAM
			slot.scale.Scale = 1
		end
		self.cursor = view.cursor
	elseif kind == "message" then
		self.heading.Text = view.heading
		self.sub.Text = self:_prompt(view.sub)
	end
	self:_paintBoard()
end

function Hud:_open(view)
	self.view = view
	self.card.Visible = true
	self.banner.Visible = false
	self:_setBlur(true)
	self:_render()
end

function Hud:showTitle(board)
	self:_open({ kind = "title", board = board })
end

-- `returning`: the initials are pre-filled from last time, so confirming just keeps them.
function Hud:showInitials(letters: { string }, cursor: number, score: number, returning: boolean)
	self:_open({ kind = "initials", letters = letters, cursor = cursor, score = score, returning = returning })
end

function Hud:showGameOver(score: number, board, highlight: number?)
	self:_open({ kind = "gameover", score = score, board = board, highlight = highlight })
end

-- `sub` may be a PROMPTS key, so it follows the input mode.
function Hud:showMessage(heading: string, sub: string)
	self:_open({ kind = "message", heading = heading, sub = sub })
end

-- New table from the server: repaint it if it's on screen.
function Hud:setBoard(board, highlight: number?)
	local view = self.view
	if view and self.card.Visible and (view.kind == "title" or view.kind == "gameover") then
		view.board = board
		if highlight ~= nil then
			view.highlight = highlight
		end
		self:_paintBoard()
	end
end

function Hud:hideOverlay()
	self.view = nil
	self.card.Visible = false
	self:_setBlur(false)
end

-- Per frame: fits the layout to the screen and runs the little pulses the web does in CSS.
function Hud:update(dt: number)
	self.clock += dt
	local camera = workspace.CurrentCamera
	local size = if camera then camera.ViewportSize else nil
	if size and size ~= self.viewport then
		self.viewport = size
		-- The layouts are drawn for a 1100 x 700 screen and shrink to fit smaller ones.
		self.fit = math.clamp(math.min(size.X / 1100, size.Y / 700), 0.55, 1)
		self.panelScale.Scale = self.fit
		self.topScale.Scale = math.clamp(size.X / 1000, 0.6, 1)
		self.bannerScale.Scale = self.fit
	end
	local swing = (math.sin(self.clock * math.pi / 0.9) + 1) / 2
	self.subScale.Scale = 1 + 0.06 * swing
	if self.view and self.view.kind == "initials" then
		local slot = self.slots[self.cursor]
		if slot then
			slot.scale.Scale = 1 + 0.06 * (math.sin(self.clock * math.pi / 0.45) + 1) / 2
		end
	end
end

return Hud
