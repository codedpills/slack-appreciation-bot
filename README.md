# Slack Appreciation Bot

A Slack bot for peer-to-peer appreciation aligned with company values. This bot allows team members to recognize each other using a simple syntax, with point awarding, daily limits, a leaderboard, and redeemable rewards.

## Features

- Recognition via "@user +++ for ... #value" syntax
- Daily point budget enforcement
- Company values tagging
- App Home leaderboard
- Admin configuration commands
- Reward redemption system
- Zero-cost hosting compatibility

## Getting Started

### Prerequisites

- Node.js (v14 or newer)
- npm or yarn
- A Slack workspace with admin rights

### Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/slack-appreciation-bot.git
   cd slack-appreciation-bot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory with your Slack credentials:
   ```
   SLACK_BOT_TOKEN=xoxb-your-bot-token
   SLACK_APP_TOKEN=xapp-your-app-token
   SLACK_SIGNING_SECRET=your-signing-secret
   DATA_FILE_PATH=./data/store.json
   PORT=3000
   ADMIN_USERS=U12345678,U87654321
   ```

4. Build the TypeScript code:
   ```bash
   npm run build
   ```

5. Start the bot:
   ```bash
   npm start
   ```

### Creating a Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps) and click "Create New App"
2. Choose "From scratch" and provide a name for your app
3. Under "Basic Information", note your Signing Secret
4. Under "Socket Mode", enable it and create an App-Level Token with the `connections:write` scope
5. Under "OAuth & Permissions":
   - Add the following Bot Token Scopes:
     - `app_mentions:read`
     - `channels:history`
     - `channels:read`
     - `chat:write`
     - `commands`
     - `groups:history`
     - `im:history`
     - `users:read`
     - `reactions:write`
   - Install the app to your workspace
   - Note your Bot User OAuth Token
6. Under "Event Subscriptions":
   - Enable events
   - Subscribe to bot events:
     - `app_home_opened`
     - `message.channels`
     - `message.groups`
     - `message.im`
7. Under "Slash Commands":
   - Create the following commands:
     - `/points`
     - `/redeem`
8. Under "App Home":
   - Enable the Home Tab

## Usage

### Updated Recognition Syntax

To recognize a team member, use the following syntax in any channel where the bot is present:

```
@username ++ helped me debug an issue #innovation
```

This awards the user 2 points for the "innovation" value. The number of `+` symbols determines the points awarded.

You can also recognize multiple users or groups in a single message:

```
@username1 @username2 +++ for great teamwork #teamwork
@developers ++ let's go #teamwork
```

- The first example awards 3 points to both `@username1` and `@username2` for the "teamwork" value.
- The second example awards 2 points to all members of the `@developers` group for the "teamwork" value.

### Commands

#### Admin Commands

- `/points config daily_limit <n>` - Set the daily point limit
- `/points config add_value <value>` - Add a company value
- `/points config remove_value <value>` - Remove a company value
- `/points reward add "Reward Name" <cost>` - Add a redeemable reward
- `/points reward remove "Reward Name"` - Remove a reward
- `/points reset @user` - Reset a user's points to 0
- `/points reset all` - Reset all users' points to 0

#### User Commands

- `/redeem "Reward Name"` - Redeem a reward
- `/redeem` (without arguments) - Open the redemption modal

### App Home

The App Home shows:

- Leaderboard of top recognized team members
- User's own stats (total points, points by value)
- Instructions for recognizing teammates and redeeming rewards

## Data Storage

Data is stored in a JSON file. The default location is `./data/store.json`. The file path can be configured using the `DATA_FILE_PATH` environment variable.

## Hosting

This bot can be hosted on various free tier platforms:

- Heroku Free Dyno
- Glitch.com
- Replit
- Railway.app free tier

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/my-new-feature`)
3. Commit your changes (`git commit -am 'Add some feature'`)
4. Write tests for your changes
5. Run the test suite to ensure functionality (`npm test`)
6. Push to the branch (`git push origin feature/my-new-feature`)
7. Create a new Pull Request

## Testing

Run tests using:

```bash
npm test
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.