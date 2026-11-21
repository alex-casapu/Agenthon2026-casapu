import { z } from "zod";
import { answerQuestion } from "@/lib/answer/answer";
import { principalFromRequest } from "@/lib/api-principal";
import { defaultLlm, llmModel } from "@/lib/llm";
import { getDb } from "@/lib/store";

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) })).min(1).max(30),
});

/**
 * Chat as the acting role. The model only ever sees approved claims that role
 * may see; whatever the message says about who is asking changes nothing.
 */
export async function POST(req: Request) {
  const principal = principalFromRequest(req);
  if (!principal) return Response.json({ error: "Choose who you are first." }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.messages[parsed.data.messages.length - 1].role !== "user")
    return Response.json({ error: "body must be {messages: [...]} ending with a user message" }, { status: 400 });

  try {
    return Response.json(await answerQuestion(getDb(), principal, parsed.data.messages, { llm: defaultLlm(), model: llmModel() }));
  } catch (e) {
    return Response.json({ error: `The model call failed: ${(e as Error).message}` }, { status: 502 });
  }
}
