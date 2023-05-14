import { ChatGPTAPI } from 'chatgpt'
import dotenv from "dotenv";
import Discord from "discord.js";
import fs from "fs";

dotenv.config();

let startupPrompt = fs.readFileSync("./startup-prompt.txt", "utf-8");
const iaClient = new ChatGPTAPI({
  apiKey: process.env.OPENAI_API_KEY,
  completionParams: {
    max_tokens: 150,
    model: "gpt-3.5-turbo",
    // temperature: 0.3
  },
  systemMessage: startupPrompt
})

let isAIReady = true;
let isAIThinking = false;

// let dataForNewMessage = null;

// (async () => {
//   isAIReady = false;
//   isAIThinking = true;
//   console.log("Loading AI...");

//   let d = await iaClient.sendMessage(
//     startupPrompt,
//     {
//       onProgress: msg => console.log(msg.text),
//     }
//   );
//   dataForNewMessage = {
//     // jailbreakConversationId: d.jailbreakConversationId,
//     parentMessageId: d.id,
//     // conversationId: d.conversationId,
//   }
//   console.log(d.text);
//   console.log("AI Loaded!");
//   isAIReady = true;
//   isAIThinking = false;
// })();

/** @type {{ message: string, resolve: () => Promise<string> }[]} */
let askQueue = [];

let askQueueInProcess = false;
async function iterateAskQueue() {
  if (askQueue.length > 0 && !askQueueInProcess) {
    let ask = askQueue.shift();
    askQueueInProcess = true;
    await ask();
    askQueueInProcess = false;
    iterateAskQueue();
  }
}

const client = new Discord.Client({
  intents: [
    "GuildMessages",
    "MessageContent",
    "Guilds"
  ]
});

let lastMessageAtTr = Date.now();

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  if (!isAIReady) return;

  let bypass = false;

  if (msg.channel.id === "1078487954927923220") {
    if ((lastMessageAtTr + 1000 * 60 * 15) < Date.now() && msg.member.roles.cache.every(r => r.id === r.guild.id)) bypass = true;
    lastMessageAtTr = Date.now();
  }

  if (bypass || msg.mentions.members.has(client.user.id)) {
    let content = msg.content.replace(/<.+>/, "").replace(/ +/, " ").trim();
    if (!content.length) {
      await msg.reply(`🤖 Gerçekten hiç bir şey sormayacak mısın?`).catch(err => { });
      return;
    }

    let thinkMsg = await msg.reply(`⏳ Düşünüyorum...`);
    msg.channel.sendTyping();
    let typingInterval = setInterval(() => {
      msg.channel.sendTyping();
    }, 3000);
    await new Promise(r => {
      askQueue.push(async () => {
        let question = `Selam ben ${msg.author.username}, ${content}`;
        let d = await iaClient.sendMessage(
          question,
          {
            // ...dataForNewMessage,
            onProgress: msg => console.log(msg.text),
          }
        );
        clearInterval(typingInterval);
        let response = d.text.replace(/chatgpt/gi, "Acoger").replace(/\[\^\d+\^\]/gi, "");
        response = response.replace(/#[a-z-]+/g, (m) => {
          m = m.slice(1);
          let ch = msg.guild.channels.cache.find(c => c.name.toLowerCase() === m.toLowerCase());
          if (!ch) return `#${m}`;
          return `<#${ch.id}>`;
        });
        await msg.channel.sendTyping();
        console.log(question, "->", response);
        thinkMsg.delete().catch(() => { });
        msg.reply(`🤖 ${response.length > 1000 ? response.slice(0, 997) + "..." : response}`).catch(err => {
          msg.channel.send(`🤖 <@${msg.author.id}>, ${response.length > 1000 ? response.slice(0, 997) + "..." : response}`);
        });
        r();
      });
      iterateAskQueue();
    })
  }
})

client.login(process.env.DISCORD_TOKEN);
