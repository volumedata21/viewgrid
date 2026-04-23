# Tallo
### Self-hosted pinboard web-app
<img width="969" height="531" alt="Captura de pantalla 2026-04-23 a la(s) 9 29 15 a m" src="https://github.com/user-attachments/assets/d3287b00-db47-414c-b478-6341dca93b7e" />

## What is Tallo?
Tallo (Spanish for stem) turns folders of images and videos into an image board. Create a media folder, add content, and Tallo takes care of the rest. It supports a wide variety of image and video media.

## Features
* Generates boards based on content in the media folder
* Add tags
* Add geolocation via Google Maps links
* Add URLs
* Multi-select
* Searchable
* Supports sub-folder navigation
* Supports video and animated gifs
* Supports read-only mode (disables tagging and uploads)
* Idle mode after 5 minutes, which prevents the app from affecting sleep and screensavers
* Can build locally by running the app.py file ('python3 app.py'
* Can build locally with Docker

## AI Disclosure
I'm a terrible coder and used Gemini to build this app. AI did not help with this write-up and I did not use AI to create the favicon/logo. I created the favicon/logo in Photoshop.

## How to install and use
Start by downloading or cloning this repository. You can then either launch with python or by using the included docker.build.yaml file for Docker.
### Using Python on MacOS/Linux
1. Open Terminal
2. Type in `cd [location of download folder]` You can download the Tallo folder into Terminal and it will fill in the folder path.
3. Type in `mkdir media` to create a media folder
4. Type in `python3 app.py`
5. You can use any browser to access the app at http://localhost:7000
6. Now populate the app with media. Copy jpegs, gifs, mp4s, movs, webm, webp, png, etc into the media folder. Alternatively, you can drag media directly onto the website, and it will upload files into the media folder.
7. Media should appear when you refresh the page.

Alternatively you can launch a read-only version and/or change the port. For example:
```python3 app.py -p 8080 --readonly```

### Using Docker
I've provided a compose.build.yaml file to use. Maybe I should just rename it to a compose.yaml file but I don't want anyone to be confused as this is currently not available on Dockerhub or anything. You'll be building locally. But I promise it's simple. 
1. Open Terminal
2. Type in `cd [location of download folder]` You can download the Tallo folder into Terminal and it will fill in the folder path.
3. Type in `mkdir media` to create a media folder
4. Type in `docker compose -f compose.build.yaml up -d --build`
5. You can use any browser to access the app at http://localhost:7000
6. Now populate the app with media. Copy jpegs, gifs, mp4s, movs, webm, webp, png, etc into the media folder. Alternatively, you can drag media directly onto the website and it will upload files into the media folder.
7. Media should appear when you refresh the page.

Because this is a local build, you can edit files if you'd like to make your own changes. For example, you can easily change the favicon image by simply replacing the /static/favicon.png image and the Dockerbuild will use whatever favicon.png file you used. The compose.build.yaml file also allows you to switch the instance to read-only mode, change ports, and map a different /media folder.

### compose.build.yaml file
```
services:
  tallo:
    build: .
    container_name: tallo
    ports:
      - "7000:7000"
    volumes:
      - ./media:/app/media
      - ./data:/app/data
    restart: unless-stopped

    # Mode 1: Admin Mode (Full Access - Uploads and Tagging Enabled)
    command: ["python", "app.py", "--host", "0.0.0.0", "--port", "5001"]

    # Mode 2: Read-Only Mode (Uploads and Tagging Disabled)
    # command: ["python", "app.py", "--host", "0.0.0.0", "--port", "5001", "--readonly"]
```

### Using on Windows
I do not have access to a Windows machine, but the instructions should be similar to the MacOS/Linux instructions.

## Security
Tallo does not feature any sign-in options. I highly suggest running this local-only. Tallo does have a read-only mode. This is suggested if running a public instance if needed. The benefits of a read-only instance:
1. You can show anyone your galleries
2. No one can upload media
3. No one can mess up your tags

Alternatively you can try using Nginx Proxy Manager's log-in feature or something like Pocket ID to lock your public instance.
