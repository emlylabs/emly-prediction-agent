import logging
from typing import List, Optional, Dict, Any

from langchain_community.document_loaders import (
    PyPDFLoader,
    Docx2txtLoader,
    TextLoader,
    CSVLoader,
    UnstructuredMarkdownLoader,
    BSHTMLLoader,
    JSONLoader
)
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import PGVector
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_openai import OpenAIEmbeddings

from app.config import (
    DB_CONNECTION_STRING,
    EMBEDDING_SOURCE,
    EMBEDDING_MODEL,
    EMBEDDING_KEY,
    VECTOR_COLLECTION_NAME,
    CHUNK_SIZE,
    CHUNK_OVERLAP,
    TOP_K
)

log = logging.getLogger(__name__)


# Mapping of file extensions to LangChain loaders
LOADER_MAPPING = {
    ".pdf": PyPDFLoader,
    ".docx": Docx2txtLoader,
    ".doc": Docx2txtLoader,
    ".txt": TextLoader,
    ".csv": CSVLoader,
    ".md": UnstructuredMarkdownLoader,
    ".html": BSHTMLLoader,
    ".htm": BSHTMLLoader,
    ".json": JSONLoader
}


class VectorizationService:
    """
    Service for document vectorization using LangChain.
    Supports HuggingFace (local) and Online (OpenAI, Google, Anthropic, Ollama) embedding modes.
    """
    
    def __init__(
        self,
        source: str = EMBEDDING_SOURCE,
        model: str = EMBEDDING_MODEL,
        api_key: str = EMBEDDING_KEY,
        collection_name: str = VECTOR_COLLECTION_NAME
    ):
        self.source = source.lower()
        self.model = model
        self.api_key = api_key
        self.collection_name = collection_name
        self.embeddings = self._init_embeddings()
        self.vector_store = self._init_vector_store()
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=CHUNK_SIZE,
            chunk_overlap=CHUNK_OVERLAP,
            length_function=len
        )
        log.info(f"VectorizationService initialized with source: {source}, model: {model}")

    def _init_embeddings(self):
        """Initialize embeddings based on source (huggingface or online providers)"""
        if self.source == "huggingface":
            log.info(f"Using HuggingFace embeddings: {self.model}")
            return HuggingFaceEmbeddings(
                model_name=self.model,
                model_kwargs={'device': 'cpu'},
                encode_kwargs={'normalize_embeddings': True}
            )
        elif self.source == "openai":
            if not self.api_key:
                raise ValueError("No API key found for OpenAI embeddings. Set EMBEDDING_KEY")
            log.info(f"Using OpenAI embeddings: {self.model}")
            return OpenAIEmbeddings(
                model=self.model,
                openai_api_key=self.api_key
            )
        elif self.source in ["google", "anthropic", "ollama"]:
            # For other providers, we can extend here
            # For now, fallback to OpenAI-compatible interface
            log.info(f"Using {self.source} embeddings: {self.model}")
            raise ValueError(f"Embedding provider '{self.source}' not yet fully implemented. Use 'huggingface' or 'openai'")
        else:
            raise ValueError(f"Unknown embedding source: {self.source}. Use 'huggingface', 'openai', 'google', 'anthropic', or 'ollama'")

    def _init_vector_store(self):
        """Initialize PGVector store"""
        return PGVector(
            connection_string=DB_CONNECTION_STRING,
            collection_name=self.collection_name,
            embedding_function=self.embeddings
        )

    def load_document(self, file_path: str, file_extension: str):
        """
        Load document using appropriate LangChain loader based on file extension.
        
        Args:
            file_path: Path to the file
            file_extension: File extension (e.g., '.pdf', '.docx')
            
        Returns:
            List of loaded documents
        """
        extension = file_extension.lower()
        
        if extension not in LOADER_MAPPING:
            raise ValueError(f"Unsupported file extension: {extension}")
        
        loader_class = LOADER_MAPPING[extension]
        
        # Special handling for JSON loader
        if extension == ".json":
            loader = loader_class(file_path, jq_schema=".", text_content=False)
        else:
            loader = loader_class(file_path)
        
        log.info(f"Loading document: {file_path} with {loader_class.__name__}")
        return loader.load()

    def split_document(self, documents: List, chunk_size: int = 1000, chunk_overlap: int = 200):
        """
        Split documents into chunks.
        
        Args:
            documents: List of documents to split
            chunk_size: Size of each chunk
            chunk_overlap: Overlap between chunks
            
        Returns:
            List of document chunks
        """
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=len
        )
        
        chunks = self.text_splitter.split_documents(documents)
        log.info(f"Split documents into {len(chunks)} chunks")
        return chunks

    async def add_vectors(self, chunks: List, metadata: Optional[Dict[str, Any]] = None):
        """
        Add document chunks to vector store.
        
        Args:
            chunks: List of document chunks
            metadata: Optional metadata to add to all chunks
            
        Returns:
            List of IDs for added vectors
        """
        if metadata:
            for chunk in chunks:
                chunk.metadata.update(metadata)
        
        ids = self.vector_store.add_documents(chunks)
        log.info(f"Added {len(ids)} vectors to store")
        return ids

    async def vectorize_file(
        self,
        file_path: str,
        file_extension: str,
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """
        Complete pipeline: load, split, and vectorize a document.
        
        Args:
            file_path: Path to the file
            file_extension: File extension
            chunk_size: Size of each chunk
            chunk_overlap: Overlap between chunks
            metadata: Optional metadata
            
        Returns:
            List of IDs for added vectors
        """
        # Load document
        documents = self.load_document(file_path, file_extension)
        
        # Split into chunks
        chunks = self.split_document(documents, chunk_size, chunk_overlap)
        
        # Add to vector store
        ids = await self.add_vectors(chunks, metadata)
        
        return ids

    async def search(
        self,
        query: str,
        top_k: int = TOP_K,
        threshold: float = 0.7,
        filters: Optional[Dict[str, Any]] = None,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """
        Search for similar documents in vector store.
        
        Args:
            query: Search query text
            top_k: Number of results to return
            threshold: Similarity threshold (0.0 - 1.0)
            filters: Optional metadata filters
            **kwargs: Additional parameters (include_score, etc.)
            
        Returns:
            List of search results with content and metadata
        """
        include_score = kwargs.get('include_score', True)
        
        if include_score:
            results = self.vector_store.similarity_search_with_score(
                query=query,
                k=top_k,
                filter=filters
            )
            
            # Filter by threshold and format results
            formatted_results = []
            for doc, score in results:
                # PGVector returns distance, lower is better
                # Convert to similarity score (1 - distance) if needed
                similarity = 1 - score if score <= 1 else 1 / (1 + score)
                
                if similarity >= threshold:
                    formatted_results.append({
                        "content": doc.page_content,
                        "metadata": doc.metadata,
                        "score": similarity
                    })
            
            log.info(f"Search returned {len(formatted_results)} results for query: {query[:50]}...")
            return formatted_results
        else:
            results = self.vector_store.similarity_search(
                query=query,
                k=top_k,
                filter=filters
            )
            
            formatted_results = [
                {
                    "content": doc.page_content,
                    "metadata": doc.metadata
                }
                for doc in results
            ]
            
            log.info(f"Search returned {len(formatted_results)} results for query: {query[:50]}...")
            return formatted_results

    async def delete_vectors(self, ids: List[str]) -> bool:
        """
        Delete vectors by their IDs.
        
        Args:
            ids: List of vector IDs to delete
            
        Returns:
            True if successful
        """
        try:
            self.vector_store.delete(ids)
            log.info(f"Deleted {len(ids)} vectors")
            return True
        except Exception as e:
            log.error(f"Error deleting vectors: {e}")
            return False

    async def delete_vectors_by_metadata(self, filter_dict: Dict[str, Any]) -> bool:
        """
        Delete vectors by metadata filter (e.g., document_id).
        
        Args:
            filter_dict: Metadata filter dict (e.g., {"document_id": "uuid-here"})
            
        Returns:
            True if successful
        """
        try:
            # PGVector supports delete with filter
            self.vector_store.delete(filter=filter_dict)
            log.info(f"Deleted vectors with filter: {filter_dict}")
            return True
        except Exception as e:
            log.error(f"Error deleting vectors by metadata: {e}")
            return False

    async def delete_by_document_id(self, document_id: str) -> bool:
        """
        Delete all vectors associated with a document.
        
        Args:
            document_id: The document ID to delete vectors for
            
        Returns:
            True if successful
        """
        return await self.delete_vectors_by_metadata({"document_id": document_id})

    async def delete_by_filename(self, filename: str) -> bool:
        """
        Delete all vectors associated with a filename.
        
        Args:
            filename: The filename to delete vectors for
            
        Returns:
            True if successful
        """
        return await self.delete_vectors_by_metadata({"filename": filename})

    async def delete_by_filenames(self, filenames: List[str]) -> Dict[str, bool]:
        """
        Delete all vectors associated with multiple filenames.
        
        Args:
            filenames: List of filenames to delete vectors for
            
        Returns:
            Dict with filename as key and success status as value
        """
        results = {}
        for filename in filenames:
            results[filename] = await self.delete_by_filename(filename)
        return results


# Singleton instance
vectorization_service = VectorizationService()
