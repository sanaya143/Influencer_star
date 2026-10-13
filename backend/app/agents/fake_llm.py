"""Scripted ADK model used by tests (LLM_PROVIDER=fake) to exercise the LLM-mode agent path
without network access or an API key. Not used in normal operation."""
from __future__ import annotations

import json
import re
from typing import AsyncGenerator

from google.adk.models import BaseLlm, LlmRequest, LlmResponse
from google.genai import types

from ..services.data_provider import get_provider
from .brief_parser import parse_request


class FakeLlm(BaseLlm):
    model: str = "fake-llm"

    @classmethod
    def supported_models(cls) -> list[str]:
        return ["fake-llm"]

    @staticmethod
    def _concierge_turn(contents) -> list:
        """Scripted chat coordinator: picks tools with the same keyword rules as the offline router, then writes the
        answer from the tool results with the same templates. Exercises the real ADK tool loop without a network."""
        from .concierge import compose, plan
        texts = [p.text for c in contents if c.role == "user" for p in (c.parts or []) if getattr(p, "text", None)]
        user_text = (texts[-1] if texts else "").split("New request:")[-1].strip()
        intent, calls, note = plan(user_text)
        last_user = max((i for i, c in enumerate(contents) if c.role == "user" and any(getattr(p, "text", None) for p in c.parts or [])), default=-1)
        calls_made, results = [], []
        for c in contents[last_user + 1:]:  # only tool activity since the latest user message; earlier turns are history
            for p in c.parts or []:
                if getattr(p, "function_call", None):
                    calls_made.append((p.function_call.name, dict(p.function_call.args or {})))
                if getattr(p, "function_response", None):
                    results.append((p.function_response.name, dict(p.function_response.response or {})))
        if results:
            args_by_name = dict(calls_made)
            return [types.Part(text=compose(intent, [(n, args_by_name.get(n, {}), r) for n, r in results], note))]
        if not calls:
            return [types.Part(text=compose(intent, [], note))]
        return [types.Part(function_call=types.FunctionCall(name=n, args=a)) for n, a in calls]

    async def generate_content_async(self, llm_request: LlmRequest, stream: bool = False) -> AsyncGenerator[LlmResponse, None]:
        contents = llm_request.contents or []
        has_tools = bool(llm_request.config and llm_request.config.tools)
        sysi = getattr(llm_request.config, "system_instruction", None) if llm_request.config else None
        flat = " ".join(p.text for c in contents for p in (c.parts or []) if getattr(p, "text", None))
        if isinstance(sysi, str):
            flat = sysi + " " + flat
        in_tokens = max(1, len(flat) // 4)
        if has_tools and isinstance(sysi, str) and "You are Zylo Concierge" in sysi:
            parts = self._concierge_turn(contents)
            out_tokens = 25
        elif has_tools:
            responded = any(p.function_response for c in contents for p in (c.parts or []))
            if responded:
                parts = [types.Part(text="Brief submitted.")]
            else:
                text = flat.split("\n\n(Pre-selected")[0]
                m = re.search(r"Pre-selected product: (\w+)", flat)
                prov = get_provider()
                product, fields, cands = parse_request(text, prov.product(m.group(1)) if m else None, prov.products())
                if product is None:
                    args = {"product_id": cands[0]["product_id"] if cands else "P001", "objective": "", "target_age_segments": [],
                            "target": "", "location": "", "budget_gbp": 0.0, "preferred_interests": [], "prioritise_micro": False,
                            "min_followers": 0, "min_promo_views": 0,
                            "needs_clarification": ["Product is ambiguous; please choose one."]}
                else:
                    args = {"product_id": product.product_id, "objective": fields.get("objective", ""),
                            "target_age_segments": fields.get("target_age_segments", []), "target": fields.get("target", ""),
                            "location": fields.get("location", ""), "budget_gbp": fields.get("budget_gbp", 0.0),
                            "preferred_interests": fields.get("preferred_interests", []),
                            "prioritise_micro": fields.get("prioritise_micro", False), "min_followers": fields.get("min_followers", 0),
                            "min_promo_views": fields.get("min_promo_views", 0), "needs_clarification": []}
                parts = [types.Part(function_call=types.FunctionCall(name="submit_brief", args=args))]
            out_tokens = 20
        else:
            m = re.search(r"Input JSON:\s*(\{.*\})\s*Respond with JSON", flat, re.S)
            from .workflow import template_insights
            payload = json.loads(m.group(1)) if m else {"top_candidates": [], "funnel": {"retrieved": 0}, "product": "?", "micro_candidates": []}
            text = json.dumps(template_insights(payload))
            parts = [types.Part(text=text)]
            out_tokens = max(1, len(text) // 4)
        yield LlmResponse(content=types.Content(role="model", parts=parts),
                          usage_metadata=types.GenerateContentResponseUsageMetadata(
                              prompt_token_count=in_tokens, candidates_token_count=out_tokens, total_token_count=in_tokens + out_tokens))
