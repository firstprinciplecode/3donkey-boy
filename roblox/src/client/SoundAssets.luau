-- Uploaded audio, as "rbxassetid://<id>". Leave an entry blank to keep that part silent.
-- Upload roblox/audio/*.wav (render them with npm run roblox:audio) via Studio's Asset Manager.
-- Each level skin has its own loop, plus the octave-up copy that plays while the hammer is held.
-- A blank theme falls back to Meadow, so a level is never stuck without music.
return {
	sfx = "rbxassetid://132411596456389", -- popscotch-sfx.wav
	themes = {
		meadow = {
			music = "rbxassetid://95813875145494", -- popscotch-music-meadow.wav
			hammer = "rbxassetid://110828184154301", -- popscotch-music-meadow-hammer.wav
		},
		candy = {
			music = "rbxassetid://73613746503787", -- popscotch-music-candy.wav
			hammer = "rbxassetid://111800531640544", -- popscotch-music-candy-hammer.wav
		},
		desert = {
			music = "rbxassetid://101605395770582", -- popscotch-music-desert.wav
			hammer = "rbxassetid://134139223193780", -- popscotch-music-desert-hammer.wav
		},
		autumn = {
			music = "rbxassetid://104549181699219", -- popscotch-music-autumn.wav
			hammer = "rbxassetid://100379232587491", -- popscotch-music-autumn-hammer.wav
		},
		winter = {
			music = "rbxassetid://119587843668124", -- popscotch-music-winter.wav
			hammer = "rbxassetid://118306785340558", -- popscotch-music-winter-hammer.wav
		},
		tomb = {
			music = "rbxassetid://89854972049151", -- popscotch-music-tomb.wav
			hammer = "rbxassetid://108049239198560", -- popscotch-music-tomb-hammer.wav
		},
		volcano = {
			music = "rbxassetid://123576026282484", -- popscotch-music-volcano.wav
			hammer = "rbxassetid://115347050169564", -- popscotch-music-volcano-hammer.wav
		},
	},
}
