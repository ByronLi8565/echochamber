We are making a collaborative soundboard web app based off an infinite canvas layout. 

Keep things simple and very modular.

Start with the basic infinite canvas. Users should be able to pan and place down two items: soundboard buttons and text boxes. Once placed, these two items should be movable. Text boxes should be editable, and soundboard buttons should be able to capture mic input.



expand the music bubbles a bit
- labels: editable textbox below each bubble
- sounds should be async so you can trigger a button more than once and have sounds overlap
- properties: should display as smaller bubbles next to each sound bubble
  - keyboard hotkey: auto-generated for each bubble, and can edit
  - filters 
    - slowed 
    - reverb
    - reversed
    - nightcore (faster + pitch corrected)

I want state to be persisted, using Automerge as a CRDT library.
Let's tackle this step by step. First off, I want all info in a soundboard (all sounds, their hotkeys, selected filters, labels) to be stored in an Automerge document. 
Sounds probably have to be stored as their own files and then file paths put onto the document as an immutable string?
Then I want this to persist to localstorage, with an option to download the soundboard as a (zip file? some easily portable thing) and load a downloaded file.

Ok now I want to deploy this to Cloudflare Workers and Durable Objects. Roughly how this should work is that there should be a little
