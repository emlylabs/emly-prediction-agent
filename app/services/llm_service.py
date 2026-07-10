import logging
from typing import List, Dict, Any, Optional, AsyncGenerator, Union

from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_ollama import ChatOllama

from app.config import (
    EMLY_SOURCE,
    EMLY_MODEL,
    EMLY_KEY,
    LLM_URL,
    OLLAMA_BASE_URL
)

log = logging.getLogger(__name__)


class LLMService:
    """
    Unified LLM service using LangChain.
    Supports: OpenAI, Google (Gemini), Anthropic (Claude), Ollama
    
    If LLM_URL is provided, uses OpenAI-compatible API with that URL.
    """
    
    # Default models for each provider
    DEFAULT_MODELS = {
        "openai": "gpt-4o-mini",
        "google": "gemini-pro",
        "anthropic": "claude-3-sonnet-20240229",
        "ollama": "llama3"
    }

    def __init__(
        self,
        provider: str = EMLY_SOURCE,
        model: Optional[str] = EMLY_MODEL,
        api_key: Optional[str] = EMLY_KEY,
        base_url: Optional[str] = LLM_URL,
        temperature: float = 0.7,
        max_tokens: int = 1024
    ):
        """
        Initialize LLM service.
        
        Args:
            provider: LLM provider ('openai', 'google', 'anthropic', 'ollama')
            model: Model name (uses default if not provided)
            api_key: API key for the provider
            base_url: Custom base URL (overrides default provider URL)
            temperature: Sampling temperature
            max_tokens: Maximum tokens in response
        """
        self.provider = provider.lower()
        self.model = model or self.DEFAULT_MODELS.get(self.provider)
        self.api_key = api_key
        self.base_url = base_url
        self.temperature = temperature
        self.max_tokens = max_tokens
        
        # Initialize the LangChain chat model
        self.llm = self._create_llm()
        
        log.info(f"LLMService initialized with provider: {provider}, model: {self.model}, base_url: {base_url or 'default'}")

    def _create_llm(self) -> BaseChatModel:
        """Create LangChain LLM based on provider and config"""
        
        # If custom LLM_URL is provided, use OpenAI-compatible API
        if self.base_url:
            log.info(f"Using custom LLM URL: {self.base_url}")
            return ChatOpenAI(
                model=self.model,
                api_key=self.api_key or "not-needed",  # Some local APIs don't need key
                base_url=self.base_url,
                temperature=self.temperature,
                max_tokens=self.max_tokens
            )
        
        # Use default provider URLs
        if self.provider == "openai":
            return ChatOpenAI(
                model=self.model,
                api_key=self.api_key,
                temperature=self.temperature,
                max_tokens=self.max_tokens
            )
        
        elif self.provider == "anthropic":
            return ChatAnthropic(
                model=self.model,
                api_key=self.api_key,
                temperature=self.temperature,
                max_tokens=self.max_tokens
            )
        
        elif self.provider == "google":
            return ChatGoogleGenerativeAI(
                model=self.model,
                google_api_key=self.api_key,
                temperature=self.temperature,
                max_output_tokens=self.max_tokens
            )
        
        elif self.provider == "ollama":
            return ChatOllama(
                model=self.model,
                base_url=OLLAMA_BASE_URL,
                temperature=self.temperature,
                num_predict=self.max_tokens
            )
        
        else:
            raise ValueError(f"Unsupported provider: {self.provider}. Supported: openai, google, anthropic, ollama")

    def _messages_to_langchain(self, messages: List[Dict[str, str]]) -> List:
        """Convert message dicts to LangChain message objects"""
        lc_messages = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            
            if role == "system":
                lc_messages.append(SystemMessage(content=content))
            elif role == "assistant":
                lc_messages.append(AIMessage(content=content))
            else:  # user
                lc_messages.append(HumanMessage(content=content))
        
        return lc_messages

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        stream: bool = False,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> Union[str, AsyncGenerator[str, None]]:
        """
        Generate text completion.
        
        Args:
            prompt: User prompt
            system_prompt: Optional system prompt
            stream: If True, returns AsyncGenerator; if False, returns str
            temperature: Override default temperature
            max_tokens: Override default max_tokens
            **kwargs: Additional parameters for the API
            
        Returns:
            str if stream=False, AsyncGenerator[str] if stream=True
        """
        messages = []
        
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        
        messages.append({"role": "user", "content": prompt})
        
        return await self.chat(
            messages=messages,
            stream=stream,
            temperature=temperature,
            max_tokens=max_tokens,
            **kwargs
        )

    async def chat(
        self,
        messages: List[Dict[str, str]],
        stream: bool = False,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> Union[str, AsyncGenerator[str, None]]:
        """
        Chat completion with message history.
        
        Args:
            messages: List of message dicts with 'role' and 'content'
            stream: If True, returns AsyncGenerator; if False, returns str
            temperature: Override default temperature
            max_tokens: Override default max_tokens
            **kwargs: Additional parameters for the API
            
        Returns:
            str if stream=False, AsyncGenerator[str] if stream=True
        """
        try:
            # Convert to LangChain messages
            lc_messages = self._messages_to_langchain(messages)
            
            # Create a new LLM with overridden params if needed
            llm = self.llm
            if temperature is not None or max_tokens is not None:
                llm = self._get_llm_with_params(
                    temperature=temperature or self.temperature,
                    max_tokens=max_tokens or self.max_tokens
                )
            
            if stream:
                # Return streaming generator
                return self._stream_response(llm, lc_messages, **kwargs)
            else:
                # Return full response
                response = await llm.ainvoke(lc_messages, **kwargs)
                content = response.content
                log.info(f"Generated response with {len(content)} characters")
                return content
            
        except Exception as e:
            log.error(f"Error generating response: {e}")
            raise

    async def _stream_response(
        self,
        llm: BaseChatModel,
        lc_messages: List,
        **kwargs
    ) -> AsyncGenerator[str, None]:
        """Internal streaming generator"""
        try:
            async for chunk in llm.astream(lc_messages, **kwargs):
                if chunk.content:
                    yield chunk.content
        except Exception as e:
            log.error(f"Error in streaming: {e}")
            raise

    def _get_llm_with_params(self, temperature: float, max_tokens: int) -> BaseChatModel:
        """Get LLM instance with specific params"""
        # Create new instance with overridden params
        return LLMService(
            provider=self.provider,
            model=self.model,
            api_key=self.api_key,
            base_url=self.base_url,
            temperature=temperature,
            max_tokens=max_tokens
        ).llm

    def set_provider(self, provider: str, model: Optional[str] = None):
        """
        Switch to a different provider.
        
        Args:
            provider: New provider name
            model: Optional new model name
        """
        self.provider = provider.lower()
        self.model = model or self.DEFAULT_MODELS.get(self.provider)
        self.llm = self._create_llm()
            
        log.info(f"Switched to provider: {provider}, model: {self.model}")

    def set_base_url(self, base_url: Optional[str]):
        """
        Set custom base URL for LLM API.
        
        Args:
            base_url: Custom URL or None to use default
        """
        self.base_url = base_url
        self.llm = self._create_llm()
        log.info(f"Base URL set to: {base_url or 'default'}")

    @staticmethod
    def list_providers() -> List[str]:
        """List available providers"""
        return ["openai", "google", "anthropic", "ollama"]

    @staticmethod
    def list_models(provider: str) -> Dict[str, str]:
        """List suggested models for a provider"""
        models = {
            "openai": {
                "gpt-4": "Most capable OpenAI model",
                "gpt-4-turbo": "Faster GPT-4 variant",
                "gpt-4o-mini": "Fast and cost-effective",
                "gpt-3.5-turbo": "Legacy fast model"
            },
            "google": {
                "gemini-pro": "Google's Gemini Pro model",
                "gemini-1.5-pro": "Latest Gemini model"
            },
            "anthropic": {
                "claude-3-opus-20240229": "Most capable Claude model",
                "claude-3-sonnet-20240229": "Balanced performance",
                "claude-3-haiku-20240307": "Fast and compact"
            },
            "ollama": {
                "llama3": "Meta's Llama 3",
                "mistral": "Mistral 7B",
                "codellama": "Code-focused Llama",
                "deepseek-coder": "DeepSeek Coder"
            }
        }
        return models.get(provider.lower(), {})


# Default instance
llm_service = LLMService()
