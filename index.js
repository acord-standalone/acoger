import { BingAIClient } from "@waylaidwanderer/chatgpt-api";
import dotenv from "dotenv";
import Discord from "discord.js";
import fs from "fs";

dotenv.config();

const aiClient = new BingAIClient({
  userToken: process.env.BING_SYDNEY_TOKEN,
});

let isAIReady = false;
let isAIThinking = false;

let dataForNewMessage = null;
let startupPrompt = fs.readFileSync("./startup-prompt.txt", "utf-8");

(async () => {
  isAIReady = false;
  isAIThinking = true;
  console.log("Loading AI...");
  let d = await aiClient.sendMessage(
    startupPrompt,
    {
      jailbreakConversationId: true
    });
  dataForNewMessage = {
    jailbreakConversationId: d.jailbreakConversationId,
    parentMessageId: d.messageId,
    conversationSignature: d.conversationSignature,
  }
  console.log(d.response);
  console.log("AI Loaded!");
  isAIReady = true;
  isAIThinking = false;
})();

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
        let d = await aiClient.sendMessage(
          question,
          {
            ...dataForNewMessage,
            onProgress: console.log
          }
        );
        clearInterval(typingInterval);
        let response = d.response.replace(/sydney|bing/gi, "Acoger").replace(/\[\^\d+\^\]/gi, "");
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
