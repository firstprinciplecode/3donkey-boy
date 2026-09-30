-- Sound effects and music, played from the web game's audio rendered to files (see
-- roblox/tools/render-audio.ts). Every effect lives in one sheet file and plays its own time range.

local ContentProvider = game:GetService("ContentProvider")
local SoundService = game:GetService("SoundService")

local SoundAssets = require(script.Parent.SoundAssets)
local SoundSprite = require(script.Parent.SoundSprite)

local POOL_SIZE = 16
local SFX_VOLUME = 0.5
local MUSIC_VOLUME = 0.5
-- Extra time before a cue is stopped by hand, in case its playback region was ignored.
local STOP_SLACK = 0.05

local Audio = {}
Audio.__index = Audio

local function group(name: string, volume: number, parent: Instance): SoundGroup
	local g = Instance.new("SoundGroup")
	g.Name = name
	g.Volume = volume
	g.Parent = parent
	return g
end

local function sound(id: string, soundGroup: SoundGroup, looped: boolean): Sound
	local s = Instance.new("Sound")
	s.SoundId = id
	s.SoundGroup = soundGroup
	s.Looped = looped
	s.Parent = soundGroup
	return s
end

function Audio.new()
	local self = setmetatable({}, Audio)
	self.muted = false
	self.hammer = false
	self.skin = "meadow"
	self.idle = {} :: { Sound }
	self.busy = {} :: { [Sound]: {} }
	self.tracks = {} :: { [string]: { music: Sound, hammer: Sound } }

	local folder = Instance.new("Folder")
	folder.Name = "PopscotchAudio"
	folder.Parent = SoundService
	self.sfxGroup = group("Effects", SFX_VOLUME, folder)
	self.musicGroup = group("Music", MUSIC_VOLUME, folder)

	local preload = {}
	if SoundAssets.sfx ~= "" then
		for _ = 1, POOL_SIZE do
			local s = sound(SoundAssets.sfx, self.sfxGroup, false)
			-- Playback regions aren't enabled everywhere; without them the timed Stop() ends each cue.
			self.regions = pcall(function()
				s.PlaybackRegionsEnabled = true
			end)
			table.insert(self.idle, s)
		end
		table.insert(preload, self.idle[1])
	end
	for skin, ids in SoundAssets.themes do
		if ids.music ~= "" and ids.hammer ~= "" then
			local music = sound(ids.music, self.musicGroup, true)
			local hammer = sound(ids.hammer, self.musicGroup, true)
			hammer.Volume = 0
			self.tracks[skin] = { music = music, hammer = hammer }
			table.insert(preload, music)
			table.insert(preload, hammer)
		end
	end
	local meadow = self.tracks.meadow
	self.music = if meadow then meadow.music else nil
	self.musicHammer = if meadow then meadow.hammer else nil
	if #preload > 0 then
		task.spawn(function()
			ContentProvider:PreloadAsync(preload)
		end)
	end
	return self
end

-- Plays one effect from the sheet. `speed` shifts its pitch (1 = as rendered). Dropped rather than
-- queued if the sheet isn't loaded yet or every pooled Sound is busy.
function Audio:play(name: string, speed: number?)
	local cue = SoundSprite.cues[name]
	local s = self.idle[#self.idle]
	if not cue or not s or not s.IsLoaded then
		return
	end
	table.remove(self.idle)
	local rate = speed or 1
	s.PlaybackSpeed = rate
	if self.regions then
		s.PlaybackRegion = NumberRange.new(cue.start, cue.start + cue.length)
	end
	s.TimePosition = cue.start
	s:Play()
	local token = {}
	self.busy[s] = token
	task.delay(cue.length / rate + STOP_SLACK, function()
		if self.busy[s] == token then
			self.busy[s] = nil
			s:Stop()
			table.insert(self.idle, s)
		end
	end)
end

-- Switches to a level's tune. A skin with no uploaded loop keeps playing Meadow.
-- If music is already going, the new loop takes over from the top.
function Audio:setTheme(skin: string)
	if skin == self.skin then
		return
	end
	local playing = self.music ~= nil and self.music.IsPlaying
	if self.music then
		self.music:Stop()
		self.musicHammer:Stop()
	end
	self.skin = skin
	local track = if self.tracks then self.tracks[skin] or self.tracks.meadow else nil
	self.music = if track then track.music else nil
	self.musicHammer = if track then track.hammer else nil
	if not self.music then
		return
	end
	self.music.TimePosition = 0
	self.musicHammer.TimePosition = 0
	self.music.Volume = if self.hammer then 0 else 1
	self.musicHammer.Volume = if self.hammer then 1 else 0
	if playing then
		self.music:Play()
		self.musicHammer:Play()
	end
end

-- Starts the loop, or carries on from where pause() left it.
function Audio:startMusic()
	if not self.music then
		return
	end
	for _, s in { self.music, self.musicHammer } do
		if s.IsPaused and s.TimePosition > 0 then
			s:Resume()
		elseif not s.IsPlaying then
			s:Play()
		end
	end
end

function Audio:pauseMusic()
	if self.music then
		self.music:Pause()
		self.musicHammer:Pause()
	end
end

-- Halts and rewinds to the top of the song.
function Audio:stopMusic()
	if self.music then
		self.music:Stop()
		self.musicHammer:Stop()
	end
end

-- The lead jumps an octave while the hammer is held: both loops run together and swap volume.
function Audio:setHammer(on: boolean)
	if not self.music or self.hammer == on then
		return
	end
	self.hammer = on
	if on then
		self.musicHammer.TimePosition = self.music.TimePosition
	end
	self.music.Volume = if on then 0 else 1
	self.musicHammer.Volume = if on then 1 else 0
end

function Audio:toggleMute(): boolean
	self.muted = not self.muted
	if self.sfxGroup then
		self.sfxGroup.Volume = if self.muted then 0 else SFX_VOLUME
		self.musicGroup.Volume = if self.muted then 0 else MUSIC_VOLUME
	end
	return self.muted
end

-- Sound is optional: if setting it up fails, the game carries on silently and says why in Output.
function Audio.tryNew()
	local ok, result = pcall(Audio.new)
	if ok then
		return result
	end
	warn(`[popscotch] audio disabled: {result}`)
	return setmetatable({ muted = false, hammer = false, idle = {}, busy = {} }, Audio)
end

return Audio
