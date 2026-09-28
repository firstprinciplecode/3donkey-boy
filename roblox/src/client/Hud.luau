local GuiService = game:GetService("GuiService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local Config = require(ReplicatedStorage:WaitForChild("Shared").Config)

local C = Config.COLORS

local Hud = {}
Hud.__index = Hud

local function label(parent: Instance, text: string, size: number, color: Color3): TextLabel
	local l = Instance.new("TextLabel")
	l.BackgroundTransparency = 1
	l.Font = Enum.Font.GothamBold
	l.TextSize = size
	l.TextColor3 = color
	l.TextStrokeTransparency = 0.4
	l.TextStrokeColor3 = C.black
	l.Text = text
	l.Parent = parent
	return l
end

function Hud.new(playerGui: Instance, levelName: string)
	local self = setmetatable({}, Hud)
	local gui = Instance.new("ScreenGui")
	gui.Name = "PopscotchHud"
	gui.ResetOnSpawn = false
	gui.Parent = playerGui

	local title = label(gui, string.upper(levelName), 22, C.yellow)
	title.AnchorPoint = Vector2.new(0.5, 0)
	title.Position = UDim2.new(0.5, 0, 0, 10)
	title.Size = UDim2.fromOffset(400, 30)

	local hint = label(gui, "← →  run     ↑ ↓  climb     Space  jump", 16, C.cream)
	hint.AnchorPoint = Vector2.new(0.5, 1)
	hint.Position = UDim2.new(0.5, 0, 1, -16)
	hint.Size = UDim2.fromOffset(500, 24)

	local banner = Instance.new("Frame")
	banner.AnchorPoint = Vector2.new(0.5, 0.5)
	banner.Position = UDim2.fromScale(0.5, 0.35)
	banner.Size = UDim2.fromOffset(420, 96)
	banner.BackgroundColor3 = C.black
	banner.BackgroundTransparency = 0.15
	banner.Visible = false
	banner.Parent = gui
	Instance.new("UICorner").Parent = banner

	local heading = label(banner, "", 36, C.yellow)
	heading.Position = UDim2.fromOffset(0, 14)
	heading.Size = UDim2.new(1, 0, 0, 40)

	local sub = label(banner, "", 18, C.cream)
	sub.Position = UDim2.fromOffset(0, 58)
	sub.Size = UDim2.new(1, 0, 0, 24)

	local score = label(gui, "", 22, C.cream)
	score.AnchorPoint = Vector2.new(0, 0)
	score.Position = UDim2.fromOffset(16, 10)
	score.Size = UDim2.fromOffset(220, 30)
	score.TextXAlignment = Enum.TextXAlignment.Left

	local status = label(gui, "", 20, C.cream)
	status.AnchorPoint = Vector2.new(1, 0)
	status.Position = UDim2.new(1, -16, 0, 10)
	status.Size = UDim2.fromOffset(260, 30)
	status.TextXAlignment = Enum.TextXAlignment.Right

	-- 1-U-P chips under the score, lit as each letter is picked up.
	local chips = {}
	for i, ch in { "1", "U", "P" } do
		local chip = label(gui, ch, 20, C.grey)
		chip.Position = UDim2.fromOffset(16 + (i - 1) * 26, 40)
		chip.Size = UDim2.fromOffset(22, 26)
		chip.BackgroundColor3 = C.black
		chip.BackgroundTransparency = 0.4
		Instance.new("UICorner").Parent = chip
		chips[i] = chip
	end

	self.gui, self.banner, self.heading, self.sub = gui, banner, heading, sub
	self.scoreLabel, self.statusLabel = score, status
	self.chips = chips
	self.lives, self.bonus = 0, 0
	return self
end

-- Poster-style score: 333-000
function Hud.formatScore(n: number): string
	local safe = math.max(0, math.floor(n))
	return string.format("%03d-%03d", safe // 1000, safe % 1000)
end

function Hud:setScore(score: number)
	self.scoreLabel.Text = `SCORE  {Hud.formatScore(score)}`
end

function Hud:_updateStatus()
	self.statusLabel.Text = `LIVES  {self.lives}     BONUS  {self.bonus}`
end

function Hud:setLives(lives: number)
	self.lives = lives
	self:_updateStatus()
end

function Hud:setLetters(held: { boolean })
	for i, chip in self.chips do
		chip.TextColor3 = if held[i] then C.yellow else C.grey
	end
end

function Hud:setBonus(bonus: number)
	self.bonus = bonus
	self:_updateStatus()
end

-- Floating "100-pt" text that rises and fades from a world position (in studs).
function Hud:popup(text: string, worldPos: Vector3)
	local camera = workspace.CurrentCamera
	if not camera then
		return
	end
	local screen, onScreen = camera:WorldToViewportPoint(worldPos)
	if not onScreen then
		return
	end
	-- WorldToViewportPoint ignores the top bar inset, which this ScreenGui respects.
	local inset = GuiService:GetGuiInset()
	local popup = label(self.gui, text, 20, C.yellow)
	popup.AnchorPoint = Vector2.new(0.5, 0.5)
	popup.Size = UDim2.fromOffset(260, 24)
	popup.Position = UDim2.fromOffset(screen.X - inset.X, screen.Y - inset.Y)
	local info = TweenInfo.new(0.9, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
	local tween = TweenService:Create(popup, info, {
		Position = popup.Position - UDim2.fromOffset(0, 40),
		TextTransparency = 1,
		TextStrokeTransparency = 1,
	})
	tween.Completed:Once(function()
		popup:Destroy()
	end)
	tween:Play()
end

function Hud:show(heading: string, sub: string)
	self.heading.Text = heading
	self.sub.Text = sub
	self.banner.Visible = true
end

function Hud:hide()
	self.banner.Visible = false
end

return Hud
