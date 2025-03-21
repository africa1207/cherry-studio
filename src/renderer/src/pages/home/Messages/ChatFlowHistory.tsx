import '@xyflow/react/dist/style.css'

import { MessageOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons'
import { Background, Controls, MiniMap, Panel, ReactFlow, ReactFlowProvider } from '@xyflow/react'
import { Edge, Node, NodeTypes, Position, useEdgesState, useNodesState } from '@xyflow/react'
import { Spin, Tooltip } from 'antd'
import { FC, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

// 自定义节点组件
const CustomNode: FC<{ data: any }> = ({ data }) => {
  const { t } = useTranslation()
  const nodeType = data.type
  let borderColor = 'var(--color-border)'
  let icon = <MessageOutlined />
  let title = ''

  // 根据消息类型设置不同的样式和图标
  if (nodeType === 'user') {
    borderColor = 'var(--color-info)'
    icon = <UserOutlined />
    title = data.userName || t('chat.history.user_node')
  } else if (nodeType === 'assistant') {
    borderColor = 'var(--color-primary)'
    icon = <RobotOutlined />
    title = `${data.model || t('chat.history.assistant_node')}`
  }

  // 文本内容截断
  const truncatedContent = data.content.length > 50 ? `${data.content.substring(0, 50)}...` : data.content

  // 处理节点点击事件，滚动到对应消息
  const handleNodeClick = () => {
    if (data.messageId && document.getElementById(data.messageId)) {
      const messageElement = document.getElementById(data.messageId)
      if (messageElement) {
        // 使用更明确的滚动行为
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // 添加高亮效果以便用户更容易注意到
        messageElement.classList.add('highlight-message')
        // 短暂延迟后移除高亮效果
        setTimeout(() => {
          messageElement.classList.remove('highlight-message')
        }, 2000)
      }
    }
  }

  return (
    <Tooltip
      title={
        <TooltipContent>
          <TooltipTitle>{title}</TooltipTitle>
          <TooltipBody>{data.content}</TooltipBody>
          <TooltipFooter>{t('chat.history.click_to_navigate')}</TooltipFooter>
        </TooltipContent>
      }
      placement="top"
      color="rgba(0, 0, 0, 0.85)"
      mouseEnterDelay={0.3}
      mouseLeaveDelay={0.1}
      destroyTooltipOnHide
      overlayInnerStyle={{
        maxWidth: '300px',
        maxHeight: '300px',
        overflow: 'auto'
      }}
      overlayStyle={{
        zIndex: 1500,
        pointerEvents: 'auto'
      }}>
      <CustomNodeContainer style={{ borderColor }} onClick={handleNodeClick}>
        <NodeHeader>
          <NodeIcon>{icon}</NodeIcon>
          <NodeTitle>{title}</NodeTitle>
        </NodeHeader>
        <NodeContent>{truncatedContent}</NodeContent>
      </CustomNodeContainer>
    </Tooltip>
  )
}

// 创建自定义节点类型
const nodeTypes: NodeTypes = {
  custom: CustomNode
}

interface ChatFlowHistoryProps {
  conversationId?: string
}

// 定义我们将使用的节点和边的类型
type FlowNode = Node<any, string>
type FlowEdge = Edge<any>

// 定义消息类型
interface MessageGroup {
  user: {
    element: HTMLElement
    content: string
    id: string
  }
  assistants: Array<{
    element: HTMLElement
    content: string
    model: string
    id: string
  }>
}

const ChatFlowHistory: FC<ChatFlowHistoryProps> = ({ conversationId }) => {
  const { t } = useTranslation()
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([])
  const [loading, setLoading] = useState(true)

  // 安全地获取元素的ID
  const safeGetElementId = (element: Element, fallbackId: string): string => {
    return (element as HTMLElement).id || fallbackId
  }

  // 从DOM元素中安全地提取文本内容
  const safeGetTextContent = (element: Element): string => {
    return element.textContent || ''
  }

  // 提取模型名称
  const extractModelName = (element: HTMLElement): string => {
    const modelElement = element.querySelector('.model-name')
    if (modelElement) {
      return safeGetTextContent(modelElement)
    }
    return ''
  }

  // 获取用户名称
  const extractUserName = (element: HTMLElement): string => {
    // 这里可以根据实际DOM结构调整选择器
    const userNameElement = element.querySelector('.user-name')
    if (userNameElement) {
      return safeGetTextContent(userNameElement)
    }
    return t('chat.history.user_node')
  }

  const buildConversationFlowData = useCallback(() => {
    if (!conversationId) return { nodes: [], edges: [] }

    // 查找所有消息元素
    const container = document.getElementById(conversationId)
    if (!container) return { nodes: [], edges: [] }

    // 获取所有消息元素
    const messageElements = Array.from(container.querySelectorAll('.message-user, .message-assistant'))

    // 根据DOM位置顺序对消息进行分组处理
    const messageGroups: MessageGroup[] = []
    let currentGroup: Partial<MessageGroup> = {}

    // 按DOM顺序遍历所有消息元素（从前到后）
    messageElements.forEach((element) => {
      const isUserMessage = element.classList.contains('message-user')
      const isAssistantMessage = element.classList.contains('message-assistant')

      if (isUserMessage) {
        // 如果已经有一个用户消息及至少一个助手回复，创建新组
        if (currentGroup.user && currentGroup.assistants && currentGroup.assistants.length > 0) {
          messageGroups.push(currentGroup as MessageGroup)
          currentGroup = {}
        }

        // 添加用户消息
        const htmlElement = element as HTMLElement
        currentGroup.user = {
          element: htmlElement,
          content: safeGetTextContent(htmlElement),
          id: safeGetElementId(htmlElement, `user-${messageGroups.length}`)
        }
        currentGroup.assistants = []
      } else if (isAssistantMessage && currentGroup.user) {
        // 添加助手消息到当前组
        if (!currentGroup.assistants) {
          currentGroup.assistants = []
        }

        const htmlElement = element as HTMLElement
        currentGroup.assistants.push({
          element: htmlElement,
          content: safeGetTextContent(htmlElement),
          model: extractModelName(htmlElement),
          id: safeGetElementId(htmlElement, `assistant-${messageGroups.length}-${currentGroup.assistants.length}`)
        })
      }
    })

    // 添加最后一组
    if (currentGroup.user && currentGroup.assistants) {
      messageGroups.push(currentGroup as MessageGroup)
    }

    // 创建节点和边
    const flowNodes: FlowNode[] = []
    const flowEdges: FlowEdge[] = []

    // 垂直间距和水平间距
    const verticalGap = 120
    const horizontalGap = 300

    // 处理每一组消息
    messageGroups.forEach((group, groupIndex) => {
      const { user, assistants } = group

      // 创建用户节点
      const userNodeId = `user-${groupIndex}`
      const userY = groupIndex * verticalGap * 2 // 用户消息垂直排列

      flowNodes.push({
        id: userNodeId,
        type: 'custom',
        data: {
          userName: extractUserName(user.element),
          content: user.content,
          type: 'user',
          messageId: user.id
        },
        position: { x: 0, y: userY },
        sourcePosition: Position.Right,
        targetPosition: Position.Left
      })

      // 连接到上一个节点（如果存在）
      if (groupIndex > 0) {
        // 找到上一组的最后一个助手消息
        const prevGroupAssistants = messageGroups[groupIndex - 1].assistants
        if (prevGroupAssistants && prevGroupAssistants.length > 0) {
          const lastAssistantId = `assistant-${groupIndex - 1}-${prevGroupAssistants.length - 1}`

          flowEdges.push({
            id: `edge-${lastAssistantId}-to-${userNodeId}`,
            source: lastAssistantId,
            target: userNodeId,
            type: 'default',
            animated: true
          })
        }
      }

      // 创建助手节点
      if (assistants && assistants.length > 0) {
        const assistantY = userY + verticalGap // 助手消息与用户消息垂直间隔

        assistants.forEach((assistant, assistantIndex) => {
          const assistantNodeId = `assistant-${groupIndex}-${assistantIndex}`
          const assistantX = horizontalGap * (assistantIndex + 1) // 水平排列助手消息

          flowNodes.push({
            id: assistantNodeId,
            type: 'custom',
            data: {
              model: assistant.model,
              content: assistant.content,
              type: 'assistant',
              messageId: assistant.id
            },
            position: { x: assistantX, y: assistantY },
            sourcePosition: Position.Right,
            targetPosition: Position.Left
          })

          // 连接用户消息到第一个助手回复
          if (assistantIndex === 0) {
            flowEdges.push({
              id: `edge-${userNodeId}-to-${assistantNodeId}`,
              source: userNodeId,
              target: assistantNodeId,
              type: 'default',
              animated: true
            })
          } else {
            // 如果有多个助手回复，它们之间横向连接
            const prevAssistantId = `assistant-${groupIndex}-${assistantIndex - 1}`
            flowEdges.push({
              id: `edge-${prevAssistantId}-to-${assistantNodeId}`,
              source: prevAssistantId,
              target: assistantNodeId,
              type: 'default',
              animated: true
            })
          }
        })
      }
    })

    return { nodes: flowNodes, edges: flowEdges }
  }, [conversationId, t])

  useEffect(() => {
    setLoading(true)
    setTimeout(() => {
      const { nodes: flowNodes, edges: flowEdges } = buildConversationFlowData()
      setNodes([...flowNodes])
      setEdges([...flowEdges])
      setLoading(false)
    }, 500)
  }, [buildConversationFlowData, setNodes, setEdges])

  return (
    <FlowContainer>
      {loading ? (
        <LoadingContainer>
          <Spin size="large" />
        </LoadingContainer>
      ) : nodes.length > 0 ? (
        <ReactFlowProvider>
          <div style={{ width: '100%', height: '100%' }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              zoomOnDoubleClick={true}
              preventScrolling={true}
              elementsSelectable={true}
              selectNodesOnDrag={false}
              nodesFocusable={true}
              zoomOnScroll={true}
              panOnScroll={false}
              minZoom={0.2}
              maxZoom={2}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              proOptions={{ hideAttribution: true }}
              className="react-flow-container"
              defaultViewport={{ x: 0, y: 0, zoom: 1 }}>
              <Controls showInteractive={false} />
              <MiniMap
                nodeStrokeWidth={3}
                pannable
                nodeColor={(node) => {
                  return node.data.type === 'user' ? 'var(--color-info)' : 'var(--color-primary)'
                }}
              />
              <Background gap={12} size={1} />
              <Panel position="top-center">
                <FlowTitle>{t('chat.history.flow_title')}</FlowTitle>
              </Panel>
            </ReactFlow>
          </div>
        </ReactFlowProvider>
      ) : (
        <EmptyContainer>
          <EmptyText>{t('chat.history.coming_soon')}</EmptyText>
        </EmptyContainer>
      )}
    </FlowContainer>
  )
}

const FlowContainer = styled.div`
  width: 100%;
  height: 100%;
  min-height: 500px;
`

const LoadingContainer = styled.div`
  width: 100%;
  height: 100%;
  min-height: 500px;
  display: flex;
  justify-content: center;
  align-items: center;
`

const EmptyContainer = styled.div`
  width: 100%;
  height: 100%;
  min-height: 500px;
  display: flex;
  justify-content: center;
  align-items: center;
  color: var(--color-text-secondary);
`

const EmptyText = styled.div`
  font-size: 16px;
`

const FlowTitle = styled.div`
  font-size: 16px;
  font-weight: bold;
  background-color: rgba(255, 255, 255, 0.8);
  padding: 8px 16px;
  border-radius: 4px;
  color: var(--color-text);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`

const CustomNodeContainer = styled.div`
  padding: 10px;
  border-radius: 8px;
  background-color: var(--bg-color);
  border: 2px solid;
  width: 250px;
  font-size: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: all 0.2s ease-in-out;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 8px rgba(0, 0, 0, 0.15);
  }
`

const NodeHeader = styled.div`
  font-weight: bold;
  margin-bottom: 5px;
  padding-bottom: 5px;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text);
  display: flex;
  align-items: center;
`

const NodeIcon = styled.span`
  margin-right: 8px;
  display: flex;
  align-items: center;
`

const NodeTitle = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const NodeContent = styled.div`
  margin: 8px 0;
  color: var(--color-text);
  max-height: 60px;
  overflow-y: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`

const TooltipContent = styled.div`
  max-width: 300px;
`

const TooltipTitle = styled.div`
  font-weight: bold;
  margin-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  padding-bottom: 4px;
`

const TooltipBody = styled.div`
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 8px;
  white-space: pre-wrap;
`

const TooltipFooter = styled.div`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  font-style: italic;
`

export default ChatFlowHistory

// 添加消息高亮效果的全局样式
const style = document.createElement('style')
style.textContent = `
  @keyframes highlightMessage {
    0% { box-shadow: 0 0 0 0 rgba(var(--color-primary-rgb), 0.7); }
    70% { box-shadow: 0 0 0 10px rgba(var(--color-primary-rgb), 0); }
    100% { box-shadow: 0 0 0 0 rgba(var(--color-primary-rgb), 0); }
  }
  
  .highlight-message {
    animation: highlightMessage 2s ease-in-out;
    position: relative;
    z-index: 1;
  }
  
  /* 确保ReactFlow中的tooltip正常显示 */
  .react-flow-container .react-flow__node {
    z-index: 5;
  }
  
  .react-flow-container .ant-tooltip {
    z-index: 9999 !important;
  }
  
  .react-flow-container .ant-tooltip-open {
    display: block !important;
  }
  
  /* 确保tooltip内容可以正常滚动 */
  .ant-tooltip-inner {
    max-height: 300px;
    overflow-y: auto;
  }
`
document.head.appendChild(style)
