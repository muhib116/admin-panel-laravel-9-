# Lesson 2: Chat REPL with history

## Concept

Lesson 1 proved the model is stateless. So how does ChatGPT or Claude "remember"
what you said three messages ago? **The harness resends the whole conversation on
every turn.**

```
Turn 1 sends: [user: "My name is Sam"]
Turn 2 sends: [user: "My name is Sam", assistant: "Hi Sam!", user: "What is my name?"]
Turn 3 sends: [... all of the above ..., assistant: "Sam", user: "..."]
```

In `src/index.ts` this is just one array:

```ts
const messages: Message[] = [];
// each turn:
messages.push({ role: "user", content: line });
const reply = await callClaude({ system, messages });
messages.push({ role: "assistant", content: reply.content });
```

A REPL is a **R**ead **E**val **P**rint **L**oop: read a line, send it, print the answer,
repeat.

## Why cost grows

Look at the `[tokens in=...]` line after every reply. `in` keeps growing because the
history keeps growing. Turn 20 pays for turns 1 to 19 again. This is the root cause of:

- slow and expensive long chats
- the "context window full" problem (Lesson 9)

## Error handling detail

If the API call fails, we `messages.pop()` the user message we just added. Otherwise
the next turn would send two `user` messages in a row, which the API rejects. Small
details like this are what a harness is made of.

## Run it

```bash
npm start
> My name is Sam
> What is my name?
> /history
```

## Exercise

1. Add a `/clear` command that empties `messages`. Ask "what is my name?" after it.
2. Edit the history by hand: before sending, replace the first assistant reply with
   "Your name is Alex." Then ask "what is my name?". The model trusts whatever history
   you give it. That is both powerful and dangerous.
