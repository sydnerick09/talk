// Renders a single chat message: text, an image preview, or a file card.
import { FileText, Download } from "lucide-react";
import { formatFileSize, isImageType } from "../lib/fileValidation";

export default function MessageBubble({ message, isMe, senderName }) {
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={`message-row ${isMe ? "me" : "other"}`}>
      <div className="bubble">
        {!isMe && <div className="sender-name">{senderName}</div>}

        {message.message && <div>{message.message}</div>}

        {message.file_url && isImageType(message.file_type || "") && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={message.file_url}
            alt={message.file_name || "Shared image"}
            className="chat-image"
          />
        )}

        {message.file_url && !isImageType(message.file_type || "") && (
          <a
            href={message.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="file-message"
          >
            <FileText size={28} color="#16a34a" />
            <div className="file-info">
              <div className="file-name">{message.file_name}</div>
              <div className="file-meta">
                {formatFileSize(message.file_size || 0)}
              </div>
            </div>
            <Download size={18} color="#16a34a" />
          </a>
        )}

        <div className="timestamp">{time}</div>
      </div>
    </div>
  );
}
